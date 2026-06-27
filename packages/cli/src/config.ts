import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BarkanConfig {
  project_id: string;
  atlas: {
    mode: "frontend";
    root: ".";
    ignore: string[];
  };
}

export const barkanConfigFileName = "barkan.config.json";
export const barkanDirectoryName = ".barkan";

export const defaultAtlasIgnore = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
  ".cache",
  ".barkan",
  "barkan.config.json",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "images",
  "videos",
  "fonts"
];

export async function readExistingBarkanConfig(cwd: string): Promise<BarkanConfig | null> {
  const configFilePath = await findExistingConfigFilePath(cwd);
  if (!configFilePath) {
    return null;
  }

  try {
    const contents = await readFile(configFilePath, "utf8");
    const parsed = JSON.parse(contents) as Partial<BarkanConfig>;

    if (typeof parsed.project_id !== "string" || !parsed.project_id.trim()) {
      return null;
    }

    return {
      project_id: parsed.project_id,
      atlas: {
        mode: "frontend",
        root: ".",
        ignore: Array.isArray(parsed.atlas?.ignore) ? parsed.atlas.ignore : defaultAtlasIgnore
      }
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw new Error(`Could not read ${path.basename(configFilePath)}: ${getErrorMessage(error)}`);
  }
}

export async function writeBarkanConfig(cwd: string, projectId: string): Promise<BarkanConfig> {
  const config: BarkanConfig = {
    project_id: projectId,
    atlas: {
      mode: "frontend",
      root: ".",
      ignore: defaultAtlasIgnore
    }
  };

  await mkdir(path.join(cwd, barkanDirectoryName), { recursive: true });
  await writeFile(path.join(cwd, barkanConfigFileName), `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return config;
}

export async function removeBarkanProjectFiles(cwd: string): Promise<boolean> {
  const results = await Promise.all([
    removePathIfPresent(path.join(cwd, barkanConfigFileName), { recursive: false }),
    removePathIfPresent(path.join(cwd, barkanDirectoryName), { recursive: true })
  ]);

  return results.some(Boolean);
}

async function findExistingConfigFilePath(cwd: string): Promise<string | null> {
  const filePath = path.join(cwd, barkanConfigFileName);
  try {
    await readFile(filePath, "utf8");
    return filePath;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  return null;
}

async function removePathIfPresent(filePath: string, options: { recursive: boolean }): Promise<boolean> {
  try {
    await rm(filePath, { recursive: options.recursive });
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw new Error(`Could not remove ${path.basename(filePath)}: ${getErrorMessage(error)}`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
