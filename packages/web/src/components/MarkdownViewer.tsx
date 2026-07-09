"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
  frontmatter?: Record<string, any>;
}

export function MarkdownViewer({ content, frontmatter }: MarkdownViewerProps) {
  return (
    <div className="max-w-3xl">
      {/* Frontmatter display */}
      {frontmatter && Object.keys(frontmatter).length > 0 && (
        <div className="bg-ctx-surface border border-ctx-border rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {frontmatter.title && (
              <div>
                <span className="text-ctx-text-muted">Title: </span>
                <span className="font-medium">{frontmatter.title}</span>
              </div>
            )}
            {frontmatter.emoji && (
              <div>
                <span className="text-xl">{frontmatter.emoji}</span>
              </div>
            )}
            {frontmatter.status && (
              <div>
                <span className="text-ctx-text-muted">Status: </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    frontmatter.status === "active"
                      ? "bg-ctx-success/10 text-ctx-success"
                      : frontmatter.status === "draft"
                      ? "bg-ctx-warning/10 text-ctx-warning"
                      : "bg-ctx-text-muted/10 text-ctx-text-muted"
                  }`}
                >
                  {frontmatter.status}
                </span>
              </div>
            )}
            {frontmatter.author && (
              <div>
                <span className="text-ctx-text-muted">Author: </span>
                <span>{frontmatter.author}</span>
              </div>
            )}
            {frontmatter.created && (
              <div>
                <span className="text-ctx-text-muted">Created: </span>
                <span>
                  {new Date(frontmatter.created).toLocaleDateString()}
                </span>
              </div>
            )}
            {frontmatter.modified && (
              <div>
                <span className="text-ctx-text-muted">Modified: </span>
                <span>
                  {new Date(frontmatter.modified).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Tags */}
          {frontmatter.tags && frontmatter.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {frontmatter.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-ctx-accent/10 text-ctx-accent text-xs rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Markdown body */}
      <div className="prose-ctx">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
