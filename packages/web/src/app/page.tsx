import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import Link from "next/link";
import {
  FileText,
  MessageSquare,
  FolderOpen,
  Search,
  Terminal,
  ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const user = session.user as any;
  const username = user.ctxUsername || user.name || "user";

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-56">
        <Header
          title={`Welcome back, ${username}`}
          description="Your AI context layer"
        />

        <div className="p-6 max-w-5xl">
          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Contexts",
                icon: FileText,
                href: "/home/contexts",
                color: "text-blue-400",
              },
              {
                label: "Agent Logs",
                icon: MessageSquare,
                href: "/home/logs",
                color: "text-green-400",
              },
              {
                label: "Files",
                icon: FolderOpen,
                href: "/home",
                color: "text-amber-400",
              },
              {
                label: "Search",
                icon: Search,
                href: "/search",
                color: "text-purple-400",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="bg-ctx-surface border border-ctx-border rounded-lg p-4 hover:bg-ctx-surface-hover transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                  <ArrowRight className="w-4 h-4 text-ctx-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm font-medium">{item.label}</p>
              </Link>
            ))}
          </div>

          {/* Getting started */}
          <div className="bg-ctx-surface border border-ctx-border rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Getting Started</h2>
            <div className="space-y-4 text-sm text-ctx-text-muted">
              <div className="flex items-start gap-3">
                <Terminal className="w-5 h-5 text-ctx-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-ctx-text font-medium mb-1">
                    SSH Access
                  </p>
                  <p className="mb-2">
                    Access your context layer from any terminal or AI agent:
                  </p>
                  <code className="block bg-ctx-bg border border-ctx-border rounded px-3 py-2 font-mono text-sm">
                    ssh {username}@ssh.ctx.superbuilders.social
                  </code>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-ctx-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-ctx-text font-medium mb-1">
                    Create your first context
                  </p>
                  <p>
                    Navigate to{" "}
                    <Link
                      href="/home/contexts"
                      className="text-ctx-accent hover:underline"
                    >
                      Contexts
                    </Link>{" "}
                    to create a knowledge document, or via SSH:
                  </p>
                  <code className="block bg-ctx-bg border border-ctx-border rounded px-3 py-2 font-mono text-sm mt-2">
                    ssh ctx cat &gt; contexts/my-first-context.md
                  </code>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-ctx-accent mt-0.5 shrink-0" />
                <div>
                  <p className="text-ctx-text font-medium mb-1">
                    Agent integration
                  </p>
                  <p>
                    Your AI agents can read and write to ctx over SSH — no
                    SDK, no API key, no client library.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SSH Quick Reference */}
          <div className="bg-ctx-surface border border-ctx-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">
              Quick Reference
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm font-mono">
              {[
                ["List contexts", "ls contexts/"],
                ["Read a context", "cat contexts/topic.md"],
                ["Search everything", 'rg "query" contexts/ logs/'],
                ["Create a context", "cat > contexts/new.md"],
                ["View recent logs", "ls -lt logs/claude-code/ | head"],
                ["Check profile", "cat .profile/identity.md"],
              ].map(([label, cmd]) => (
                <div
                  key={label}
                  className="bg-ctx-bg border border-ctx-border rounded px-3 py-2"
                >
                  <span className="text-ctx-text-muted text-xs block mb-1">
                    {label}
                  </span>
                  <code className="text-ctx-accent text-xs">{cmd}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
