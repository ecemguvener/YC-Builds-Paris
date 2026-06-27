import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isSensitiveSourcePath } from "./sensitive-files.js";

export interface SelectedSourceFile {
  path: string;
  sizeBytes: number;
  chunks: SelectedSourceChunk[];
}

export interface SelectedSourceChunk {
  path: string;
  chunkIndex: number;
  chunkCount: number;
  content: string;
}

export interface SelectedSourceReadResult {
  files: SelectedSourceFile[];
  chunks: SelectedSourceChunk[];
  totalBytes: number;
  totalChunks: number;
}

const maxSourceChunkBytes = 64 * 1024;

export async function readSelectedSourceFiles({
  root,
  selectedFilePaths,
  allowedFilePaths,
  onFileRead
}: {
  root: string;
  selectedFilePaths: string[];
  allowedFilePaths: string[];
  onFileRead?: (filePath: string) => void;
}): Promise<SelectedSourceReadResult> {
  const absoluteRoot = path.resolve(root);
  const allowed = new Set(allowedFilePaths);
  const files: SelectedSourceFile[] = [];

  for (const selectedFilePath of selectedFilePaths) {
    if (!allowed.has(selectedFilePath) || isSensitiveSourcePath(selectedFilePath)) {
      continue;
    }

    const absolutePath = path.resolve(absoluteRoot, selectedFilePath);
    if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`) && absolutePath !== absoluteRoot) {
      continue;
    }

    const fileStats = await stat(absolutePath);
    const content = (await readFile(absolutePath)).toString("utf8");
    const chunkContents = chunkStringByUtf8Bytes(content, maxSourceChunkBytes);
    const chunks = chunkContents.map((chunkContent, index) => ({
      path: selectedFilePath,
      chunkIndex: index,
      chunkCount: chunkContents.length,
      content: chunkContent
    }));

    files.push({
      path: selectedFilePath,
      sizeBytes: fileStats.size,
      chunks
    });
    onFileRead?.(selectedFilePath);
  }

  const chunks = files.flatMap((file) => file.chunks);
  return {
    files,
    chunks,
    totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
    totalChunks: chunks.length
  };
}

function chunkStringByUtf8Bytes(content: string, maxBytes: number): string[] {
  if (content.length === 0) {
    return [""];
  }

  const chunks: string[] = [];
  let currentChunk = "";
  let currentChunkBytes = 0;

  for (const character of content) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (currentChunk && currentChunkBytes + characterBytes > maxBytes) {
      chunks.push(currentChunk);
      currentChunk = "";
      currentChunkBytes = 0;
    }

    currentChunk += character;
    currentChunkBytes += characterBytes;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
