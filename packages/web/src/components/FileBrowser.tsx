"use client";

import Link from "next/link";
import { FileText, Folder, ChevronRight } from "lucide-react";
import { formatBytes, formatRelativeTime } from "@/lib/types";
import type { CtxFile } from "@/lib/types";

interface FileBrowserProps {
  files: CtxFile[];
  basePath: string; // e.g., "/home/contexts" or "/home/logs"
  emptyMessage?: string;
}

export function FileBrowser({
  files,
  basePath,
  emptyMessage = "No files found",
}: FileBrowserProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-ctx-text-muted">
        <FileText className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border border-ctx-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_120px_100px] gap-4 px-4 py-2 bg-ctx-surface text-xs text-ctx-text-muted font-medium border-b border-ctx-border">
        <div>Name</div>
        <div className="text-right">Modified</div>
        <div className="text-right">Size</div>
      </div>

      {/* File rows */}
      {files.map((file) => {
        const href =
          file.type === "directory"
            ? `${basePath}/${file.path}`
            : `${basePath}/${file.path}`;

        return (
          <Link
            key={file.path}
            href={href}
            className="grid grid-cols-[1fr_120px_100px] gap-4 px-4 py-2.5 hover:bg-ctx-surface-hover border-b border-ctx-border last:border-b-0 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              {file.type === "directory" ? (
                <Folder className="w-4 h-4 text-ctx-accent shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-ctx-text-muted shrink-0" />
              )}
              <span className="truncate text-sm">{file.name}</span>
              {file.type === "directory" && (
                <ChevronRight className="w-3 h-3 text-ctx-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
              )}
            </div>
            <div className="text-right text-xs text-ctx-text-muted self-center">
              {formatRelativeTime(file.modified)}
            </div>
            <div className="text-right text-xs text-ctx-text-muted self-center">
              {file.type === "file" ? formatBytes(file.size) : "—"}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
