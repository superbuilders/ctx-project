import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { searchFiles } from "@/lib/fs";
import Link from "next/link";
import { FileText, Search as SearchIcon } from "lucide-react";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; type?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin");

  const username = (session.user as any).ctxUsername;
  const { q: query, type } = await searchParams;

  let results: Array<{
    path: string;
    line: number;
    snippet: string;
    score: number;
  }> = [];

  if (query) {
    try {
      results = await searchFiles(username, query, { type, limit: 50 });
    } catch {
      results = [];
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-56">
        <Header
          title="Search"
          description="Full-text search across contexts, logs, and notes"
        />
        <div className="p-6 max-w-3xl">
          {/* Search form */}
          <form action="/search" method="GET" className="mb-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ctx-text-muted" />
              <input
                type="text"
                name="q"
                defaultValue={query || ""}
                placeholder="Search your context layer..."
                autoFocus
                className="w-full bg-ctx-surface border border-ctx-border rounded-lg pl-12 pr-4 py-3 text-base placeholder:text-ctx-text-muted/50 focus:outline-none focus:ring-2 focus:ring-ctx-accent focus:border-ctx-accent"
              />
            </div>

            {/* Type filter */}
            <div className="flex gap-2 mt-3">
              {[
                { value: "", label: "All" },
                { value: "contexts", label: "Contexts" },
                { value: "logs", label: "Logs" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="submit"
                  name="type"
                  value={filter.value}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    (type || "") === filter.value
                      ? "bg-ctx-accent/10 border-ctx-accent text-ctx-accent"
                      : "border-ctx-border text-ctx-text-muted hover:border-ctx-text-muted"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </form>

          {/* Results */}
          {query && (
            <div>
              <p className="text-sm text-ctx-text-muted mb-4">
                {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;
                {query}&rdquo;
              </p>

              {results.length > 0 ? (
                <div className="space-y-3">
                  {results.map((result, i) => (
                    <Link
                      key={`${result.path}-${result.line}-${i}`}
                      href={`/home/${result.path}`}
                      className="block bg-ctx-surface border border-ctx-border rounded-lg p-4 hover:bg-ctx-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-ctx-text-muted" />
                        <span className="text-sm font-mono text-ctx-accent">
                          {result.path}
                        </span>
                        <span className="text-xs text-ctx-text-muted">
                          line {result.line}
                        </span>
                      </div>
                      <p className="text-sm text-ctx-text-muted line-clamp-2">
                        {result.snippet}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-ctx-text-muted">
                  <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No results found</p>
                  <p className="text-xs mt-1">
                    Try a different query or broader search type
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!query && (
            <div className="text-center py-16 text-ctx-text-muted">
              <SearchIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg mb-2">Search your context layer</p>
              <p className="text-sm">
                Find anything across your contexts, agent logs, and notes
              </p>
              <p className="text-xs mt-4 font-mono text-ctx-accent">
                Tip: Use SSH for advanced search — rg &quot;pattern&quot; contexts/ logs/
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
