import { promises as fs } from "fs";
import { join, relative, resolve } from "path";
import { execSync } from "child_process";
import matter from "gray-matter";

const CTX_ROOT = process.env.CTX_ROOT || "/srv/ctx";

/**
 * Types for the ctx filesystem operations
 */
export interface CtxFile {
  name: string;
  path: string; // relative to user home
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

export interface CtxStats {
  totalFiles: number;
  totalSize: number;
  contextCount: number;
  logCount: number;
}

/**
 * Resolve a relative path to an absolute path within the ctx filesystem.
 * Prevents directory traversal attacks.
 */
function resolvePath(username: string, relativePath: string): string {
  const userHome = join(CTX_ROOT, "home", username);
  const resolved = resolve(userHome, relativePath);

  // Ensure the resolved path is within the user's accessible area
  if (
    !resolved.startsWith(join(CTX_ROOT, "home", username)) &&
    !resolved.startsWith(join(CTX_ROOT, "teams"))
  ) {
    throw new Error("Access denied: path outside allowed area");
  }

  return resolved;
}

/**
 * Execute a filesystem command as a specific Unix user.
 * This preserves Unix permission semantics.
 */
function execAsUser(username: string, command: string): string {
  try {
    return execSync(`sudo -u ${username} ${command}`, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
  } catch (error: any) {
    if (error.status === 1 && error.stderr?.includes("Permission denied")) {
      throw new Error("Permission denied");
    }
    throw error;
  }
}

/**
 * List files in a directory
 */
export async function listFiles(
  username: string,
  dirPath: string = ""
): Promise<CtxFile[]> {
  const absPath = resolvePath(username, dirPath || ".");

  try {
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const files: CtxFile[] = [];

    for (const entry of entries) {
      // Skip hidden files unless in .profile
      if (entry.name.startsWith(".") && dirPath !== ".profile") continue;

      const fullPath = join(absPath, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: join(dirPath, entry.name),
          type: entry.isDirectory() ? "directory" : "file",
          size: stat.size,
          modified: stat.mtime.toISOString(),
          permissions: (stat.mode & 0o777).toString(8),
          owner: username,
        });
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort: directories first, then alphabetically
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return files;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error("Directory not found");
    }
    if (error.code === "EACCES") {
      throw new Error("Permission denied");
    }
    throw error;
  }
}

/**
 * Read a markdown document with frontmatter parsing
 */
export async function readDocument(
  username: string,
  filePath: string
): Promise<CtxDocument> {
  const absPath = resolvePath(username, filePath);

  try {
    const raw = await fs.readFile(absPath, "utf-8");
    const { data: frontmatter, content: body } = matter(raw);

    return {
      path: filePath,
      content: raw,
      frontmatter,
      body,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") throw new Error("File not found");
    if (error.code === "EACCES") throw new Error("Permission denied");
    throw error;
  }
}

/**
 * Write a document (creates or overwrites)
 */
export async function writeDocument(
  username: string,
  filePath: string,
  content: string
): Promise<void> {
  const absPath = resolvePath(username, filePath);
  const dir = join(absPath, "..");

  // Ensure parent directory exists
  await fs.mkdir(dir, { recursive: true });

  // Write atomically (temp file + rename)
  const tmpPath = absPath + ".tmp." + Date.now();
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, absPath);

  // Set ownership to the user
  try {
    execSync(`chown ${username}:${username} ${absPath}`);
  } catch {
    // Non-fatal if chown fails (dev mode)
  }
}

/**
 * Delete a file
 */
export async function deleteFile(
  username: string,
  filePath: string
): Promise<void> {
  const absPath = resolvePath(username, filePath);
  await fs.unlink(absPath);
}

/**
 * Create a directory
 */
export async function createDirectory(
  username: string,
  dirPath: string
): Promise<void> {
  const absPath = resolvePath(username, dirPath);
  await fs.mkdir(absPath, { recursive: true });

  try {
    execSync(`chown ${username}:${username} ${absPath}`);
  } catch {
    // Non-fatal
  }
}

/**
 * Get user filesystem stats
 */
export async function getUserStats(username: string): Promise<CtxStats> {
  const userHome = join(CTX_ROOT, "home", username);

  let totalFiles = 0;
  let totalSize = 0;
  let contextCount = 0;
  let logCount = 0;

  async function walk(dir: string, type?: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, type);
        } else if (entry.name.endsWith(".md")) {
          const stat = await fs.stat(fullPath);
          totalFiles++;
          totalSize += stat.size;
          if (fullPath.includes("/contexts/")) contextCount++;
          if (fullPath.includes("/logs/")) logCount++;
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await walk(userHome);
  return { totalFiles, totalSize, contextCount, logCount };
}

/**
 * Search files using grep (basic full-text search)
 */
export async function searchFiles(
  username: string,
  query: string,
  options?: { type?: string; limit?: number }
): Promise<
  Array<{ path: string; line: number; snippet: string; score: number }>
> {
  const userHome = join(CTX_ROOT, "home", username);
  const limit = options?.limit || 20;

  let searchPath = userHome;
  if (options?.type === "contexts") searchPath = join(userHome, "contexts");
  if (options?.type === "logs") searchPath = join(userHome, "logs");

  try {
    // Use ripgrep for fast search
    const result = execSync(
      `rg --json -m ${limit} -i ${JSON.stringify(query)} ${JSON.stringify(searchPath)} 2>/dev/null || true`,
      { encoding: "utf-8", timeout: 10000 }
    );

    const results: Array<{
      path: string;
      line: number;
      snippet: string;
      score: number;
    }> = [];

    for (const line of result.split("\n").filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match") {
          const absPath = parsed.data.path.text;
          results.push({
            path: relative(userHome, absPath),
            line: parsed.data.line_number,
            snippet: parsed.data.lines.text.trim().slice(0, 200),
            score: 1,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Get the absolute path to a user's home directory
 */
export function getUserHome(username: string): string {
  return join(CTX_ROOT, "home", username);
}

/**
 * Check if a user exists in the ctx filesystem
 */
export async function userExists(username: string): Promise<boolean> {
  try {
    await fs.access(join(CTX_ROOT, "home", username));
    return true;
  } catch {
    return false;
  }
}

/**
 * Provision a new user (calls the provisioning script)
 */
export function provisionUser(
  username: string,
  email: string,
  preferredName?: string,
  cognitoSub?: string
): void {
  const args = [username, email];
  if (preferredName) args.push(preferredName);
  if (cognitoSub) args.push(cognitoSub);

  execSync(`/usr/local/bin/ctx-provision ${args.map((a) => `'${a}'`).join(" ")}`, {
    timeout: 30000,
  });
}
