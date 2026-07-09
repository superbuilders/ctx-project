/**
 * Shared types for the ctx web application
 */

export interface CtxUser {
  id: string; // Cognito sub
  email: string;
  name: string;
  ctxUsername: string;
  preferredUsername: string;
}

export interface CtxFile {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  permissions: string;
  owner: string;
}

export interface CtxDocument {
  path: string;
  content: string;
  frontmatter: Record<string, any>;
  body: string;
}

export interface CtxProfile {
  identity: CtxDocument | null;
  bio: CtxDocument | null;
  projects: CtxDocument | null;
  expertise: CtxDocument | null;
  connections: CtxDocument | null;
  decisions: CtxDocument | null;
}

export interface SearchResult {
  path: string;
  line: number;
  snippet: string;
  score: number;
}

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export type FileType = "context" | "log" | "note" | "profile" | "unknown";

export function getFileType(path: string): FileType {
  if (path.startsWith("contexts/")) return "context";
  if (path.startsWith("logs/")) return "log";
  if (path.startsWith("notes/")) return "note";
  if (path.startsWith(".profile/")) return "profile";
  return "unknown";
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}
