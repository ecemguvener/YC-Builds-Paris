import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { barkanDirectoryName } from "./config.js";

export interface BarkanConnection {
  apiKey: string;
  apiBaseUrl: string;
  user: {
    id: string;
    email: string;
  };
  site: {
    id: string;
    name: string;
    domain: string;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
  connectedAt: string;
}

export async function readConnection(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<BarkanConnection | null> {
  const filePath = await findConnectionFilePath(cwd, env);
  if (!filePath) {
    return null;
  }

  try {
    const contents = await readFile(filePath, "utf8");
    const parsed = JSON.parse(contents) as Partial<BarkanConnection>;

    if (
      typeof parsed.apiKey !== "string" ||
      typeof parsed.apiBaseUrl !== "string" ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      typeof parsed.user.email !== "string"
    ) {
      return null;
    }

    return {
      apiKey: parsed.apiKey,
      apiBaseUrl: parsed.apiBaseUrl,
      user: parsed.user,
      site: isConnectionSite(parsed.site) ? parsed.site : null,
      project: isConnectionProject(parsed.project) ? parsed.project : null,
      connectedAt: typeof parsed.connectedAt === "string" ? parsed.connectedAt : new Date(0).toISOString()
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw new Error(`Could not read Barkan connection: ${getErrorMessage(error)}`);
  }
}

export async function writeConnection(
  connection: BarkanConnection,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const filePath = getConnectionFilePath(cwd, env);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(filePath), 0o700);
  await ensureLocalCredentialsAreIgnored(cwd, env);
  await writeFile(filePath, `${JSON.stringify(connection, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
  return filePath;
}

export async function removeConnection(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  try {
    await rm(getConnectionFilePath(cwd, env));
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw new Error(`Could not remove Barkan connection: ${getErrorMessage(error)}`);
  }
}

export function getConnectionFilePath(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  if (env.BARKAN_HOME) {
    return path.join(env.BARKAN_HOME, "credentials.json");
  }

  return path.join(cwd, barkanDirectoryName, "credentials.json");
}

async function findConnectionFilePath(cwd: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const candidates = [getConnectionFilePath(cwd, env)];

  for (const filePath of candidates) {
    try {
      await readFile(filePath, "utf8");
      return filePath;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }

  return null;
}

function isConnectionSite(value: unknown): value is BarkanConnection["site"] {
  if (value === null) {
    return true;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const site = value as NonNullable<BarkanConnection["site"]>;
  return typeof site.id === "string" && typeof site.name === "string" && typeof site.domain === "string";
}

function isConnectionProject(value: unknown): value is NonNullable<BarkanConnection["project"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as NonNullable<BarkanConnection["project"]>;
  return typeof project.id === "string" && typeof project.name === "string";
}

async function ensureLocalCredentialsAreIgnored(cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (env.BARKAN_HOME) {
    return;
  }

  const gitignorePath = path.join(cwd, barkanDirectoryName, ".gitignore");
  try {
    const contents = await readFile(gitignorePath, "utf8");
    const lines = contents.split(/\r?\n/).filter(Boolean);
    const ignoredEntries = new Set(lines);
    const requiredEntries = ["credentials.json", "agent.pid", "agent.log"];
    if (requiredEntries.every((entry) => ignoredEntries.has(entry))) {
      return;
    }

    await writeFile(
      gitignorePath,
      `${[...lines, ...requiredEntries.filter((entry) => !ignoredEntries.has(entry))].join("\n")}\n`,
      "utf8"
    );
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    await writeFile(gitignorePath, "credentials.json\nagent.pid\nagent.log\n", "utf8");
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
