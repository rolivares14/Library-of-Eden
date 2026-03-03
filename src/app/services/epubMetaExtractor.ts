import JSZip from "jszip";

/**
 * Extracts title and author from an EPUB file without storing anything.
 * Used before uploading to the server so metadata can be sent alongside the file.
 */
export async function extractTitleAndAuthor(
  file: File
): Promise<{ title: string | null; author: string | null }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) return { title: null, author: null };

    const containerXml = await containerFile.async("text");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "text/xml");
    const rootfile = containerDoc.querySelector(
      'rootfile[media-type="application/oebps-package+xml"]'
    );
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) return { title: null, author: null };

    const opfFile = zip.file(opfPath);
    if (!opfFile) return { title: null, author: null };

    const opfXml = await opfFile.async("text");
    const opfDoc = parser.parseFromString(opfXml, "text/xml");

    const titleNode = opfDoc.querySelector("title");
    const creatorNode = opfDoc.querySelector("creator");

    return {
      title: titleNode?.textContent?.trim() || null,
      author: creatorNode?.textContent?.trim() || null,
    };
  } catch {
    return { title: null, author: null };
  }
}
