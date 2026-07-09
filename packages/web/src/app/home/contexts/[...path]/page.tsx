import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { FileBrowser } from "@/components/FileBrowser";
import { readDocument, listFiles } from "@/lib/fs";

interface PageProps {
  params: Promise<{ path: string[] }>;
}

export default async function ContextPathPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const username = (session.user as any).ctxUsername;
  const { path: pathSegments } = await params;
  const relativePath = "contexts/" + pathSegments.join("/");
  const displayPath = pathSegments.join("/");

  // Build breadcrumbs
  const breadcrumbs = [
    { name: "~", href: "/home" },
    { name: "contexts", href: "/home/contexts" },
  ];
  pathSegments.slice(0, -1).forEach((segment, i) => {
    breadcrumbs.push({
      name: segment,
      href: "/home/contexts/" + pathSegments.slice(0, i + 1).join("/"),
    });
  });

  // Try as file first, then directory
  const isMarkdown = relativePath.endsWith(".md");

  if (isMarkdown) {
    try {
      const doc = await readDocument(username, relativePath);
      return (
        <>
          <Header
            title={doc.frontmatter?.title || displayPath}
            description={relativePath}
            breadcrumbs={breadcrumbs}
          />
          <div className="p-6">
            <MarkdownViewer
              content={doc.body}
              frontmatter={doc.frontmatter}
            />
          </div>
        </>
      );
    } catch {
      return (
        <>
          <Header title="Not Found" breadcrumbs={breadcrumbs} />
          <div className="p-6">
            <p className="text-ctx-text-muted">File not found: {relativePath}</p>
          </div>
        </>
      );
    }
  }

  // Directory listing
  let files: any[] = [];
  try {
    files = await listFiles(username, relativePath);
  } catch {
    files = [];
  }

  return (
    <>
      <Header
        title={displayPath}
        description={relativePath}
        breadcrumbs={breadcrumbs}
      />
      <div className="p-6">
        <FileBrowser
          files={files}
          basePath={"/home/contexts/" + pathSegments.slice(0, -1).join("/")}
          emptyMessage="This directory is empty."
        />
      </div>
    </>
  );
}
