import { BookOpen, Users, Download } from "lucide-react";

interface StatsProps {
  totalBooks: number;
}

export function Stats({ totalBooks }: StatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-card border border-border rounded-lg p-6 flex items-center gap-4">
        <div className="bg-primary/10 p-3 rounded-lg">
          <BookOpen className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total Books</p>
          <p className="text-2xl text-foreground">{totalBooks}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 flex items-center gap-4">
        <div className="bg-primary/10 p-3 rounded-lg">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Access</p>
          <p className="text-2xl text-foreground">Free</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 flex items-center gap-4">
        <div className="bg-primary/10 p-3 rounded-lg">
          <Download className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Format</p>
          <p className="text-2xl text-foreground">EPUB</p>
        </div>
      </div>
    </div>
  );
}