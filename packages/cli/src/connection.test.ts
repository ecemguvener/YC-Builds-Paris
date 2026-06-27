import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BarkanConnection } from "./connection.js";
import { writeConnection } from "./connection.js";

describe("Barkan connection storage", () => {
  it("tightens credentials file permissions when overwriting an existing file", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-connection-"));

    try {
      const credentialsDirectory = path.join(cwd, ".barkan");
      const credentialsPath = path.join(credentialsDirectory, "credentials.json");
      await mkdir(credentialsDirectory, { recursive: true, mode: 0o755 });
      await writeFile(credentialsPath, "{}\n", { mode: 0o644 });
      await chmod(credentialsDirectory, 0o755);
      await chmod(credentialsPath, 0o644);

      await writeConnection(createConnection(), cwd, {});

      expect((await stat(credentialsDirectory)).mode & 0o777).toBe(0o700);
      expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

function createConnection(): BarkanConnection {
  return {
    apiKey: "ck_test",
    apiBaseUrl: "http://localhost:4000",
    user: {
      id: "user_1",
      email: "dev@barkan.test"
    },
    site: null,
    project: {
      id: "proj_test",
      name: "Demo"
    },
    connectedAt: new Date("2026-05-30T00:00:00.000Z").toISOString()
  };
}
