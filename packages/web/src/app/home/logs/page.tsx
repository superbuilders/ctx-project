import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { FileBrowser } from "@/components/FileBrowser";
import { listFiles } from "@/lib/fs";
import Link from "next/link";

const PROVIDERS = [
  { slug: "claude-code", name: "Claude Code", emoji: "🤖" },
  { slug: "claude-chat", name: "Claude Chat", emoji: "💬" },
  { slug: "chatgpt", name: "ChatGPT", emoji: "🟢" },
  { slug: "codex", name: "Codex", emoji: "🔮" },
  { slug: "cursor", name: "Cursor", emoji: "📝" },
];

export default async function LogsPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const username = (session.user as any).ctxUsername;

  // Get log files per provider
  const providerData = await Promise.all(
    PROVIDERS.map(async (provider) => {
      try {
        const files = await listFiles(username, `logs/${provider.slug}`);
        return { ...provider, files, count: files.length };
      } catch {
        return { ...provider, files: [], count: 0 };
      }
    })
  );

  const totalLogs = providerData.reduce((sum, p) => sum + p.count, 0);

  return (
    <>
      <Header
        title="Agent Logs"
        description={`${totalLogs} conversation transcript${totalLogs !== 1 ? "s" : ""} across ${providerData.filter((p) => p.count > 0).length} providers`}
        breadcrumbs={[
          { name: "~", href: "/home" },
          { name: "logs", href: "/home/logs" },
        ]}
      />
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4">
          {providerData.map((provider) => (
            <div
              key={provider.slug}
              className="bg-ctx-surface border border-ctx-border rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-ctx-border">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{provider.emoji}</span>
                  <div>
                    <h3 className="text-sm font-medium">{provider.name}</h3>
                    <p className="text-xs text-ctx-text-muted">
                      {provider.count} session{provider.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-ctx-text-muted font-mono">
                  logs/{provider.slug}/
                </span>
              </div>

              {provider.count > 0 ? (
                <div className="divide-y divide-ctx-border">
                  {provider.files.slice(0, 5).map((file) => (
                    <Link
                      key={file.path}
                      href={`/home/logs/${file.path}`}
                      className="block px-4 py-2.5 hover:bg-ctx-surface-hover transition-colors"
                    >
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-ctx-text-muted ml-3">
                        {new Date(file.modified).toLocaleString()}
                      </span>
                    </Link>
                  ))}
                  {provider.count > 5 && (
                    <div className="px-4 py-2 text-xs text-ctx-text-muted">
                      + {provider.count - 5} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-ctx-text-muted">
                  No sessions yet. Configure the {provider.name} adapter to
                  start ingesting conversations.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
