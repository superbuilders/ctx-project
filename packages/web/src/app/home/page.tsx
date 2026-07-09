import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { FileBrowser } from "@/components/FileBrowser";
import { listFiles } from "@/lib/fs";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const username = (session.user as any).ctxUsername;

  let files: any[] = [];
  try {
    files = await listFiles(username, ".");
  } catch {
    files = [];
  }

  return (
    <>
      <Header
        title="My Files"
        description={`/srv/ctx/home/${username}/`}
        breadcrumbs={[{ name: "~", href: "/home" }]}
      />
      <div className="p-6">
        <FileBrowser
          files={files}
          basePath="/home"
          emptyMessage="Your home directory is empty. Create your first context or check the Getting Started guide."
        />
      </div>
    </>
  );
}
