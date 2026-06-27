import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanProjectFiles } from "./scanner.js";
import { readSelectedSourceFiles } from "./source-reader.js";

describe("Atlas source selection", () => {
  it("excludes local secret files from scans", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "barkan-scan-"));

    try {
      await writeFile(path.join(root, "App.tsx"), "export function App() { return null; }\n");
      await writeFile(path.join(root, ".env.test"), "OPENAI_API_KEY=sk-test\n");
      await writeFile(path.join(root, ".npmrc"), "//registry.npmjs.org/:_authToken=npm_secret\n");
      await mkdir(path.join(root, ".aws"), { recursive: true });
      await writeFile(path.join(root, ".aws", "credentials"), "aws_access_key_id=test\n");

      const result = await scanProjectFiles(root, []);

      expect(result.files).toEqual(["App.tsx"]);
      expect(result.skippedEntries).toBeGreaterThanOrEqual(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses selected secret files even if they appear in the allowed set", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "barkan-read-"));

    try {
      await writeFile(path.join(root, "App.tsx"), "export function App() { return null; }\n");
      await writeFile(path.join(root, ".env.test"), "OPENAI_API_KEY=sk-test\n");
      const readFiles: string[] = [];

      const result = await readSelectedSourceFiles({
        root,
        selectedFilePaths: ["App.tsx", ".env.test"],
        allowedFilePaths: ["App.tsx", ".env.test"],
        onFileRead: (filePath) => readFiles.push(filePath)
      });

      expect(result.files.map((file) => file.path)).toEqual(["App.tsx"]);
      expect(readFiles).toEqual(["App.tsx"]);
      await expect(readFile(path.join(root, ".env.test"), "utf8")).resolves.toContain("OPENAI_API_KEY");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
