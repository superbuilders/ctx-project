import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { FileBrowser } from "@/components/FileBrowser";
import { listFiles } from "@/lib/fs";

export default async function ContextsPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const username = (session.user as any).ctxUsername;

  let files: any[] = [];
  try {
    files = await listFiles(username, "contexts");
  } catch {
    files = [];
  }

  return (
    <>
      <Header
        title="Contexts"
        description="Saved knowledge artifacts — git-tracked"
        breadcrumbs={[
          { name: "~", href: "/home" },
          { name: "contexts", href: "/home/contexts" },
        ]}
      />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-ctx-text-muted">
            {files.length} item{files.length !== 1 ? "s" : ""}
          </p>
          <a
            href="/home/contexts/new"
            className="px-3 py-1.5 bg-ctx-accent text-white text-sm rounded-lg hover:bg-ctx-accent-hover transition-colors"
          >
            + New Context
          </a>
        </div>
        <FileBrowser
          files={files}
          basePath="/home/contexts"
          emptyMessage="No contexts yet. Create your first knowledge document."
        />
      </div>
    </>
  );
}
