import { FileText, MessageSquare, User, Bookmark } from "lucide-react";

interface ProfileCardProps {
  field: string;
  content: string;
  updatedAt?: string;
}

const fieldIcons: Record<string, any> = {
  identity: User,
  bio: FileText,
  projects: Bookmark,
  expertise: FileText,
  connections: User,
  decisions: MessageSquare,
};

const fieldLabels: Record<string, string> = {
  identity: "Identity",
  bio: "Biography",
  projects: "Active Projects",
  expertise: "Skills & Expertise",
  connections: "Connections",
  decisions: "Decision Log",
};

export function ProfileCard({ field, content, updatedAt }: ProfileCardProps) {
  const Icon = fieldIcons[field] || FileText;
  const label = fieldLabels[field] || field;

  return (
    <div className="bg-ctx-surface border border-ctx-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ctx-border">
        <Icon className="w-4 h-4 text-ctx-accent" />
        <h3 className="text-sm font-medium">{label}</h3>
        {updatedAt && (
          <span className="text-xs text-ctx-text-muted ml-auto">
            Updated {new Date(updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="px-4 py-3 prose-ctx text-sm">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
}
