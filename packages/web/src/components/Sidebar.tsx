"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  MessageSquare,
  User,
  Search,
  FolderOpen,
  Settings,
  LogOut,
  Terminal,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Files", href: "/home", icon: FolderOpen },
  { name: "Contexts", href: "/home/contexts", icon: FileText },
  { name: "Logs", href: "/home/logs", icon: MessageSquare },
  { name: "Profile", href: "/home/profile", icon: User },
  { name: "Search", href: "/search", icon: Search },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 h-screen bg-ctx-surface border-r border-ctx-border flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="p-4 border-b border-ctx-border">
        <Link href="/" className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-ctx-accent" />
          <span className="text-lg font-semibold tracking-tight">ctx</span>
        </Link>
        <p className="text-xs text-ctx-text-muted mt-1">context layer</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-ctx-accent/10 text-ctx-accent"
                  : "text-ctx-text-muted hover:bg-ctx-surface-hover hover:text-ctx-text"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-ctx-border space-y-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ctx-text-muted hover:bg-ctx-surface-hover hover:text-ctx-text transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ctx-text-muted hover:bg-ctx-surface-hover hover:text-ctx-text transition-colors w-full">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
