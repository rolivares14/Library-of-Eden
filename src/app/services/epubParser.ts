import JSZip from "jszip";
import { BookMetadata } from "../types/book";
import { getCachedEpub } from "./epubIndexedDB";

/**
 * Parses EPUB metadata from an ArrayBuffer directly.
 */
export async function parseEpubFromBuffer(arrayBuffer: ArrayBuffer): Promise<BookMetadata | null> {
  try {
    if (arrayBuffer.byteLength === 0) return null;

    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) return null;

    const containerXml = await containerFile.async("text");
    const opfPath = extractOpfPath(containerXml);
    if (!opfPath) return null;

    const opfFile = zip.file(opfPath);
    if (!opfFile) return null;

    const opfXml = await opfFile.async("text");
    const metadata = extractMetadataFromOpf(opfXml);

    const coverImagePath = extractCoverImagePath(opfXml, opfPath);
    let coverImageUrl: string | undefined;

    if (coverImagePath) {
      const coverFile = zip.file(coverImagePath);
      if (coverFile) {
        const coverBlob = await coverFile.async("blob");
        coverImageUrl = URL.createObjectURL(coverBlob);
      }
    }

    return { ...metadata, coverImageUrl };
  } catch (error) {
    return null;
  }
}

/**
 * Parses EPUB file to extract metadata and cover image.
 * Checks IndexedDB cache first if a bookId is provided.
 */
export async function parseEpubMetadata(
  epubUrl: string,
  bookId?: string
): Promise<BookMetadata | null> {
  try {
    // Try IndexedDB cache first
    if (bookId) {
      const cached = await getCachedEpub(bookId);
      if (cached) {
        return parseEpubFromBuffer(cached);
      }
    }

    // Fetch the EPUB file
    const response = await fetch(epubUrl);
    if (!response.ok) {
      return null;
    }

    // Check if the response is actually a valid file (not HTML error page)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Check if we got any data
    if (arrayBuffer.byteLength === 0) {
      return null;
    }

    const zip = await JSZip.loadAsync(arrayBuffer);

    // Step 1: Read container.xml to find OPF file location
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) {
      return null;
    }

    const containerXml = await containerFile.async("text");
    const opfPath = extractOpfPath(containerXml);
    if (!opfPath) {
      return null;
    }

    // Step 2: Read and parse OPF file
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      return null;
    }

    const opfXml = await opfFile.async("text");
    const metadata = extractMetadataFromOpf(opfXml);

    // Step 3: Extract cover image
    const coverImagePath = extractCoverImagePath(opfXml, opfPath);
    let coverImageUrl: string | undefined;

    if (coverImagePath) {
      const coverFile = zip.file(coverImagePath);
      if (coverFile) {
        const coverBlob = await coverFile.async("blob");
        coverImageUrl = URL.createObjectURL(coverBlob);
      }
    }

    return {
      ...metadata,
      coverImageUrl
    };
  } catch (error) {
    // Silently fail - EPUB files may not be available yet
    return null;
  }
}

/**
 * Extracts OPF file path from container.xml
 */
function extractOpfPath(containerXml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(containerXml, "text/xml");
  const rootfile = doc.querySelector('rootfile[media-type="application/oebps-package+xml"]');
  return rootfile?.getAttribute("full-path") || null;
}

/**
 * Extracts metadata from OPF XML
 */
function extractMetadataFromOpf(opfXml: string): Omit<BookMetadata, "coverImageUrl"> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opfXml, "text/xml");

  // Extract description
  const descriptionNode = doc.querySelector("description");
  let summary = "No description available.";
  
  if (descriptionNode?.textContent) {
    // Strip HTML tags and decode entities
    summary = stripHtmlTags(descriptionNode.textContent.trim());
  }

  // Extract subjects (tags)
  const subjectNodes = doc.querySelectorAll("subject");
  const subjects = Array.from(subjectNodes).map(node => node.textContent?.trim() || "");
  const tags = subjects.slice(0, 10);

  // Extract publication date
  const dateNode = doc.querySelector('date[event="publication"], date');
  let publishedYear = "Unknown";
  if (dateNode?.textContent) {
    const dateText = dateNode.textContent.trim();
    // Try to extract year from various date formats
    const yearMatch = dateText.match(/\d{4}/);
    if (yearMatch) {
      publishedYear = yearMatch[0];
    }
  }

  return {
    summary,
    tags,
    publishedYear,
    subjects
  };
}

/**
 * Strips HTML tags and decodes HTML entities from text
 */
function stripHtmlTags(html: string): string {
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Get text content (this automatically strips tags)
  let text = temp.textContent || temp.innerText || '';
  
  // Clean up extra whitespace
  text = text
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, '\n\n') // Preserve paragraph breaks
    .trim();
  
  return text;
}

/**
 * Extracts cover image path from OPF XML
 */
function extractCoverImagePath(opfXml: string, opfPath: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opfXml, "text/xml");

  // Get the directory of the OPF file (for resolving relative paths)
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

  // Method 1: Look for meta tag with name="cover"
  const coverMeta = doc.querySelector('meta[name="cover"]');
  if (coverMeta) {
    const coverId = coverMeta.getAttribute("content");
    if (coverId) {
      const coverItem = doc.querySelector(`item[id="${coverId}"]`);
      const href = coverItem?.getAttribute("href");
      if (href) {
        return opfDir + href;
      }
    }
  }

  // Method 2: Look for item with properties="cover-image"
  const coverItem = doc.querySelector('item[properties="cover-image"]');
  if (coverItem) {
    const href = coverItem.getAttribute("href");
    if (href) {
      return opfDir + href;
    }
  }

  // Method 3: Look for guide reference to cover
  const coverGuide = doc.querySelector('reference[type="cover"]');
  if (coverGuide) {
    const href = coverGuide.getAttribute("href");
    if (href) {
      // Remove any fragment identifier
      const cleanHref = href.split("#")[0];
      return opfDir + cleanHref;
    }
  }

  // Method 4: Look for common cover filenames
  const items = doc.querySelectorAll('item[media-type^="image/"]');
  for (const item of Array.from(items)) {
    const href = item.getAttribute("href");
    if (href && /cover/i.test(href)) {
      return opfDir + href;
    }
  }

  return null;
}