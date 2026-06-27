import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "./cli.js";

describe("barkan connect", () => {
  it("validates the key, writes local credentials, and does not upload source context", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/atlas/connect")) {
        return jsonResponse({
          ok: true,
          user: { id: "user_1", email: "user@example.com" },
          site: { id: "site_1", name: "Demo", domain: "demo.test" },
          project: { id: "proj_test", name: "Demo" }
        });
      }

      if (url.endsWith("/api/atlas/agent/status")) {
        return jsonResponse({
          ok: true,
          project: { id: "proj_test", name: "Demo" },
          agent: {
            connected: true,
            connectedAt: "2026-05-19T00:01:00.000Z"
          }
        });
      }

      return jsonResponse({ error: "unexpected url" }, 500);
    });

    try {
      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const exitCode = await runCli({
        argv: ["connect"],
        cwd,
        env: { ...process.env, BARKAN_DISABLE_AGENT: "1" },
        stdout,
        stderr,
        fetchImplementation: fetchMock,
        readApiKey: () => Promise.resolve("ck_test")
      });

      expect(exitCode).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls.map(([input]) => String(input)).join("\n")).not.toContain("/api/atlas/document");
      expect(fetchMock.mock.calls.map(([input]) => String(input)).join("\n")).not.toContain("/api/atlas/upload");
      expect(fetchMock.mock.calls.map(([input]) => String(input)).join("\n")).not.toContain("/api/atlas/source-context");
      const credentials = JSON.parse(await readFile(path.join(cwd, ".barkan/credentials.json"), "utf8"));
      const barkanGitignore = await readFile(path.join(cwd, ".barkan/.gitignore"), "utf8");
      expect(credentials.sourceContext).toBeUndefined();
      expect(barkanGitignore).toContain("credentials.json");
      expect(barkanGitignore).toContain("agent.pid");
      expect(barkanGitignore).toContain("agent.log");
      expect(stdout.toString()).toContain("Account");
      expect(stdout.toString()).not.toContain("Open the Documentation tab");
      expect(stderr.toString()).toBe("");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects API keys passed as connect arguments", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));
    const fetchMock = vi.fn<typeof fetch>();
    const readApiKey = vi.fn(() => Promise.resolve("ck_prompt"));

    try {
      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const exitCode = await runCli({
        argv: ["connect", "ck_argument"],
        cwd,
        env: { ...process.env, BARKAN_DISABLE_AGENT: "1" },
        stdout,
        stderr,
        fetchImplementation: fetchMock,
        readApiKey
      });

      expect(exitCode).toBe(1);
      expect(readApiKey).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stderr.toString()).toContain("API keys cannot be passed as command-line arguments");
      await expect(readFile(path.join(cwd, ".barkan/credentials.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("reports already connected with saved credentials", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/atlas/connect")) {
        expect(init?.headers).toMatchObject({ authorization: "Bearer ck_saved" });
        return jsonResponse({
          ok: true,
          user: { id: "user_1", email: "user@example.com" },
          site: { id: "site_1", name: "Demo", domain: "demo.test" },
          project: { id: "proj_test", name: "Demo" }
        });
      }

      return jsonResponse({ error: "unexpected url" }, 500);
    });

    try {
      await mkdir(path.join(cwd, ".barkan"), { recursive: true });
      await writeFile(path.join(cwd, ".barkan", "credentials.json"), JSON.stringify({
        apiKey: "ck_saved",
        apiBaseUrl: "http://localhost:4000",
        user: { id: "user_1", email: "user@example.com" },
        site: { id: "site_1", name: "Demo", domain: "demo.test" },
        project: { id: "proj_test", name: "Demo" },
        connectedAt: "2026-05-19T00:00:00.000Z"
      }));

      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const exitCode = await runCli({
        argv: ["connect"],
        cwd,
        env: { ...process.env, BARKAN_DISABLE_AGENT: "1" },
        stdout,
        stderr,
        fetchImplementation: fetchMock
      });

      expect(exitCode).toBe(0);
      expect(stdout.toString()).toContain("Already connected to Barkan");
      expect(stdout.toString()).not.toContain("Checking API key");
      expect(stderr.toString()).toBe("");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("reports already connected without requiring a new API key when saved credentials are valid", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/atlas/connect")) {
        expect(init?.headers).toMatchObject({ authorization: "Bearer ck_saved" });
        return jsonResponse({
          ok: true,
          user: { id: "user_1", email: "test@test.com" },
          site: { id: "site_1", name: "TestAl", domain: "de" },
          project: { id: "proj_pYQuRzkKdmCGUsvJ4IbS5xHf", name: "TestAl" }
        });
      }

      return jsonResponse({ error: "unexpected url" }, 500);
    });

    try {
      await mkdir(path.join(cwd, ".barkan"), { recursive: true });
      await writeFile(path.join(cwd, ".barkan", "credentials.json"), JSON.stringify({
        apiKey: "ck_saved",
        apiBaseUrl: "http://localhost:4000",
        user: { id: "user_1", email: "test@test.com" },
        site: { id: "site_1", name: "TestAl", domain: "de" },
        project: { id: "proj_pYQuRzkKdmCGUsvJ4IbS5xHf", name: "TestAl" },
        connectedAt: "2026-05-19T00:00:00.000Z"
      }));
      await writeFile(path.join(cwd, "barkan.config.json"), JSON.stringify({
        project_id: "proj_pYQuRzkKdmCGUsvJ4IbS5xHf",
        atlas: {
          mode: "frontend",
          root: ".",
          ignore: []
        }
      }));

      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const exitCode = await runCli({
        argv: ["connect"],
        cwd,
        env: { ...process.env, BARKAN_DISABLE_AGENT: "1" },
        stdout,
        stderr,
        fetchImplementation: fetchMock
      });

      expect(exitCode).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(stdout.toString()).toContain("Already connected to Barkan");
      expect(stdout.toString()).toContain("Account  test@test.com");
      expect(stdout.toString()).toContain("Site     TestAl (de)");
      expect(stdout.toString()).toContain("Project  TestAl (proj_pYQuRzkKdmCGUsvJ4IbS5xHf)");
      expect(stdout.toString()).toContain("API      http://localhost:4000");
      expect(stdout.toString()).not.toContain("Checking API key");
      expect(stderr.toString()).toBe("");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("disconnect removes local project metadata even when credentials are already missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));

    try {
      await mkdir(path.join(cwd, ".barkan"), { recursive: true });
      await writeFile(path.join(cwd, ".barkan", ".gitignore"), "credentials.json\n");
      await writeFile(path.join(cwd, ".barkan", "agent.pid"), "12345\n");
      await writeFile(path.join(cwd, "barkan.config.json"), JSON.stringify({
        project_id: "proj_stale",
        atlas: {
          mode: "frontend",
          root: ".",
          ignore: []
        }
      }));

      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      let exitCode: number;
      try {
        exitCode = await runCli({
          argv: ["disconnect"],
          cwd,
          env: {},
          stdout,
          stderr
        });
        expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
      } finally {
        killSpy.mockRestore();
      }

      expect(exitCode).toBe(0);
      await expect(readFile(path.join(cwd, "barkan.config.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(path.join(cwd, ".barkan", ".gitignore"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      expect(stdout.toString()).toContain("Disconnected from Barkan");
      expect(stderr.toString()).toBe("");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects the removed atlas init command", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));

    try {
      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const exitCode = await runCli({
        argv: ["atlas", "init"],
        cwd,
        stdout,
        stderr
      });

      expect(exitCode).toBe(1);
      expect(stderr.toString()).toContain("Unknown command: atlas init");
      expect(stderr.toString()).not.toContain("barkan atlas init");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("shows connected account metadata in status without source context metadata", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "barkan-cli-"));
    const barkanHome = path.join(cwd, ".barkan");
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      if (url.endsWith("/api/atlas/connect")) {
        return jsonResponse({
          ok: true,
          user: { id: "user_1", email: "user@example.com" },
          site: { id: "site_1", name: "Demo", domain: "demo.test" },
          project: { id: "proj_test", name: "Demo" }
        });
      }

      if (url.endsWith("/api/atlas/agent/status")) {
        return jsonResponse({
          ok: true,
          project: { id: "proj_test", name: "Demo" },
          agent: {
            connected: true,
            connectedAt: "2026-05-19T00:01:00.000Z"
          }
        });
      }

      return jsonResponse({ error: "unexpected url" }, 500);
    });

    try {
      await mkdir(barkanHome, { recursive: true });
      await writeFile(path.join(barkanHome, "credentials.json"), JSON.stringify({
        apiKey: "ck_test",
        apiBaseUrl: "http://localhost:4000",
        user: { id: "user_1", email: "user@example.com" },
        site: { id: "site_1", name: "Demo", domain: "demo.test" },
        project: { id: "proj_test", name: "Demo" },
        connectedAt: "2026-05-19T00:00:00.000Z"
      }));

      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const exitCode = await runCli({
        argv: ["status"],
        cwd,
        stdout,
        stderr,
        fetchImplementation: fetchMock
      });

      expect(exitCode).toBe(0);
      expect(stdout.toString()).toContain("Account");
      expect(stdout.toString()).toContain("Project");
      expect(stdout.toString()).toContain("Local agent");
      expect(stdout.toString()).toContain("connected since 2026-05-19T00:01:00.000Z");
      expect(stdout.toString()).not.toContain("Source files");
      expect(stdout.toString()).not.toContain("Source chunks");
      expect(stdout.toString()).not.toContain("Snapshot");
      expect(stderr.toString()).toBe("");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createWritableCapture() {
  let output = "";
  return {
    write(chunk: string | Uint8Array) {
      output += String(chunk);
      return true;
    },
    toString() {
      return output;
    }
  };
}
