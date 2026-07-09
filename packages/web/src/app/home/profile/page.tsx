import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { readDocument } from "@/lib/fs";
import ReactMarkdown from "react-markdown";

const PROFILE_FIELDS = [
  { field: "identity", label: "Identity", icon: "👤" },
  { field: "bio", label: "Biography", icon: "📝" },
  { field: "projects", label: "Active Projects", icon: "📌" },
  { field: "expertise", label: "Skills & Expertise", icon: "🎯" },
  { field: "connections", label: "Connections", icon: "🤝" },
  { field: "decisions", label: "Decision Log", icon: "⚖️" },
];

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const username = (session.user as any).ctxUsername;

  // Load all profile sections
  const profileSections = await Promise.all(
    PROFILE_FIELDS.map(async (field) => {
      try {
        const doc = await readDocument(username, `.profile/${field.field}.md`);
        return { ...field, doc, error: null };
      } catch (e: any) {
        return { ...field, doc: null, error: e.message };
      }
    })
  );

  return (
    <>
      <Header
        title="Profile"
        description={`~/.profile/ — Your structured identity documents`}
        breadcrumbs={[
          { name: "~", href: "/home" },
          { name: ".profile", href: "/home/profile" },
        ]}
      />
      <div className="p-6 max-w-3xl space-y-4">
        {profileSections.map((section) => (
          <div
            key={section.field}
            className="bg-ctx-surface border border-ctx-border rounded-lg overflow-hidden"
          >
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-ctx-border">
              <div className="flex items-center gap-2">
                <span>{section.icon}</span>
                <h3 className="text-sm font-medium">{section.label}</h3>
              </div>
              {section.doc?.frontmatter?.updated && (
                <span className="text-xs text-ctx-text-muted">
                  Updated{" "}
                  {new Date(
                    section.doc.frontmatter.updated
                  ).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Section body */}
            <div className="px-4 py-3">
              {section.doc ? (
                <div className="prose-ctx text-sm">
                  <ReactMarkdown>{section.doc.body}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-ctx-text-muted italic">
                  {section.error === "File not found"
                    ? `No ${section.label.toLowerCase()} document yet.`
                    : `Error loading: ${section.error}`}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* SSH hint */}
        <div className="text-sm text-ctx-text-muted bg-ctx-surface border border-ctx-border rounded-lg p-4">
          <p className="font-medium text-ctx-text mb-2">
            Edit via SSH
          </p>
          <code className="text-xs font-mono text-ctx-accent">
            ssh ctx vim .profile/bio.md
          </code>
        </div>
      </div>
    </>
  );
}
