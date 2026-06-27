import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { writeOpenAIPromptDebugLog, writeOpenAITimingDebugLog } from "./openai-debug.js";

const baseConfig: AppConfig = {
  NODE_ENV: "development",
  API_PORT: 4000,
  PUBLIC_APP_URL: "http://localhost:5173",
  PUBLIC_API_URL: "http://localhost:4000",
  MONGODB_URI: "mongodb://localhost/test",
  SESSION_COOKIE_NAME: "barkan_session",
  SESSION_SECRET: "test-secret-test-secret",
  ELEVENLABS_API_KEY: "eleven",
  ELEVENLABS_VOICE_ID: "voice",
  OPENAI_API_KEY: "openai",
  OPENAI_WIDGET_MODEL: "gpt-5.4-2026-03-05",
  OPENAI_ACTION_MODEL: "gpt-5.4-2026-03-05",
  OPENAI_ATLAS_MODEL: "gpt-5.4-2026-03-05"
};

describe("OpenAI debug logging", () => {
  it("writes prompt debug entries with route-map metadata", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "barkan-openai-debug-"));
    const previousCwd = process.cwd();

    try {
      process.chdir(temporaryDirectory);
      const wrote = await writeOpenAIPromptDebugLog(
        baseConfig,
        {
          siteKey: "site_public",
          userPrompt: "show billing",
          domSnapshot: {
            route: "/dashboard",
            viewportWidth: 1200,
            viewportHeight: 800,
            elements: [],
            scrollSurfaces: []
          },
          siteRouteMap: {
            version: 1,
            project_id: "proj_test",
            generated_at: "2026-05-19T00:00:00.000Z",
            source_files: ["src/routes.tsx"],
            routes: [{ path: "/settings/billing", summary: "Billing settings." }]
          }
        },
        {
          input: [{ role: "user", content: [{ type: "input_text", text: "prompt" }] }]
        }
      );

      const logFile = path.join(temporaryDirectory, ".barkan/debug/openai-prompts.json");
      const entry = JSON.parse(await readFile(logFile, "utf8"));

      expect(wrote).toBe(true);
      expect(entry).toMatchObject({
        model: "gpt-5.4-2026-03-05",
        siteKey: "site_public",
        route: "/dashboard",
        hasRouteMap: true,
        routeCount: 1,
        requestBody: {
          input: [{ role: "user", content: [{ type: "input_text", text: ["prompt"] }] }]
        }
      });
      expect(JSON.stringify(entry)).not.toContain("atlasRuntime");
    } finally {
      process.chdir(previousCwd);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("does not write prompt logs in production", async () => {
    const wrote = await writeOpenAIPromptDebugLog(
      {
        ...baseConfig,
        NODE_ENV: "production"
      },
      {
        siteKey: "site_public",
        userPrompt: "show billing",
        domSnapshot: {
          route: "/dashboard",
          viewportWidth: 1200,
          viewportHeight: 800,
          elements: [],
          scrollSurfaces: []
        }
      },
      { input: [] }
    );

    expect(wrote).toBe(false);
  });

  it("writes only the latest OpenAI timing entry outside production", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "barkan-timing-debug-"));
    const previousCwd = process.cwd();

    try {
      process.chdir(temporaryDirectory);
      const firstEntry = {
        requestId: "request_1",
        siteKey: "site_public",
        route: "/dashboard",
        model: "gpt-5.4-2026-03-05",
        status: "completed" as const,
        promptProcessing: {
          creatingUiFactsMs: 12,
          gettingRelatedDocumentationMs: 8,
          creatingPromptMs: 3
        },
        aiThinkingMs: 120,
        returningAnswerMs: 45,
        requestSetupMs: 4,
        upstreamHeadersMs: 60,
        totalServerMs: 240,
        textChunkCount: 3
      };
      const wrote = await writeOpenAITimingDebugLog(baseConfig, firstEntry);
      await writeOpenAITimingDebugLog(baseConfig, {
        ...firstEntry,
        requestId: "request_2",
        textChunkCount: 4
      });

      const logFile = path.join(temporaryDirectory, ".barkan/debug/openai-timings.json");
      const entry = JSON.parse(await readFile(logFile, "utf8"));

      expect(wrote).toBe(true);
      expect(entry).toMatchObject({
        requestId: "request_2",
        route: "/dashboard",
        promptProcessing: {
          creatingUiFactsMs: 12,
          gettingRelatedDocumentationMs: 8,
          creatingPromptMs: 3
        },
        textChunkCount: 4
      });
    } finally {
      process.chdir(previousCwd);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
