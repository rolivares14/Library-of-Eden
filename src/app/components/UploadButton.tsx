import { Upload, Loader2 } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

interface UploadButtonProps {
  onUpload: (file: File) => void;
  isUploading?: boolean;
}

export function UploadButton({ onUpload, isUploading = false }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.epub')) {
      onUpload(file);
      // Reset input so the same file can be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } else if (file) {
      toast.error('Please upload a valid EPUB file');
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub"
        onChange={handleFileChange}
        className="hidden"
        id="epub-upload"
        disabled={isUploading}
      />
      <label
        htmlFor="epub-upload"
        className={`inline-flex items-center gap-2 px-4 py-2 bg-secondary text-foreground border border-border rounded-lg cursor-pointer hover:bg-accent transition-colors text-sm ${
          isUploading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload EPUB
          </>
        )}
      </label>
    </div>
  );
}