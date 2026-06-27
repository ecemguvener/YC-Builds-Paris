import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isSensitiveSourcePath } from "./sensitive-files.js";

export interface ProjectScanResult {
  root: string;
  files: string[];
  directoriesScanned: number;
  skippedEntries: number;
}

const binaryExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".ttf",
  ".webm",
  ".woff",
  ".woff2",
  ".zip"
]);

const maxReadableFileBytes = 512 * 1024;

export async function scanProjectFiles(root: string, ignoreEntries: string[]): Promise<ProjectScanResult> {
  const absoluteRoot = path.resolve(root);
  const ignored = new Set(ignoreEntries);
  const files: string[] = [];
  let directoriesScanned = 0;
  let skippedEntries = 0;

  async function visitDirectory(directory: string) {
    directoriesScanned += 1;

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toRelativePath(absoluteRoot, absolutePath);

      if (shouldIgnore(relativePath, entry.name, ignored) || isSensitiveSourcePath(relativePath)) {
        skippedEntries += 1;
        continue;
      }

      if (entry.isSymbolicLink()) {
        skippedEntries += 1;
        continue;
      }

      if (entry.isDirectory()) {
        await visitDirectory(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        skippedEntries += 1;
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (binaryExtensions.has(extension)) {
        skippedEntries += 1;
        continue;
      }

      const fileStats = await stat(absolutePath);
      if (fileStats.size > maxReadableFileBytes) {
        skippedEntries += 1;
        continue;
      }

      files.push(relativePath);
    }
  }

  await visitDirectory(absoluteRoot);
  files.sort((left, right) => left.localeCompare(right));

  return {
    root: absoluteRoot,
    files,
    directoriesScanned,
    skippedEntries
  };
}

function shouldIgnore(relativePath: string, entryName: string, ignored: Set<string>): boolean {
  if (ignored.has(entryName) || ignored.has(relativePath)) {
    return true;
  }

  return relativePath.split("/").some((segment) => ignored.has(segment));
}

function toRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}
