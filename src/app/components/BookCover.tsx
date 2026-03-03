import { useState } from "react";

interface BookCoverProps {
  title: string;
  coverUrl?: string;
  className?: string;
}

export function BookCover({ title, coverUrl, className = "" }: BookCoverProps) {
  const [imageError, setImageError] = useState(false);

  // Show fallback if no URL provided or image failed to load
  if (!coverUrl || imageError) {
    return (
      <div 
        className={`flex items-center justify-center p-6 ${className}`}
        style={{ backgroundColor: 'var(--color-primary)', width: '100%', height: '100%' }}
      >
        <h3 className="text-center text-black leading-tight font-semibold">
          {title}
        </h3>
      </div>
    );
  }

  return (
    <img
      src={coverUrl}
      alt={title}
      className={`w-full h-full object-cover ${className}`}
      onError={() => setImageError(true)}
    />
  );
}