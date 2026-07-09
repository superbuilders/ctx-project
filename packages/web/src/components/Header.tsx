"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface HeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Array<{ name: string; href: string }>;
}

export function Header({ title, description, breadcrumbs }: HeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="border-b border-ctx-border bg-ctx-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1.5 text-sm text-ctx-text-muted mb-1">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.href} className="flex items-center gap-1.5">
                  {i > 0 && <span>/</span>}
                  <a
                    href={crumb.href}
                    className="hover:text-ctx-text transition-colors"
                  >
                    {crumb.name}
                  </a>
                </span>
              ))}
            </nav>
          )}

          <h1 className="text-xl font-semibold">{title}</h1>
          {description && (
            <p className="text-sm text-ctx-text-muted mt-0.5">{description}</p>
          )}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ctx-text-muted" />
          <input
            type="text"
            placeholder="Search contexts, logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-ctx-surface border border-ctx-border rounded-lg pl-10 pr-4 py-2 text-sm w-72 placeholder:text-ctx-text-muted/50 focus:outline-none focus:ring-1 focus:ring-ctx-accent focus:border-ctx-accent"
          />
        </form>
      </div>
    </header>
  );
}
