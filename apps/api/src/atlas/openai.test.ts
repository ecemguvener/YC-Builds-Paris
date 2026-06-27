import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config.js";
import {
  buildAtlasBackendInventoryRequestBody,
  buildAtlasFileSelectionRequestBody,
  buildAtlasRouteMapRequestBody,
  generateAtlasBackendInventory,
  generateAtlasRouteMap,
  parseAtlasBackendInventoryResponse,
  parseAtlasFileSelectionResponse,
  parseAtlasRouteMapResponse,
  parseAtlasTokenUsage,
  selectAtlasDocumentationFiles
} from "./openai.js";

const config: AppConfig = {
  NODE_ENV: "test",
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

describe("Atlas route-map OpenAI helpers", () => {
  it("builds a strict JSON route file selection request", () => {
    const body = buildAtlasFileSelectionRequestBody(config, [
      "src/App.tsx",
      "src/routes.tsx",
      "README.md"
    ]);

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("source-file explorer");
    expect(serialized).toContain("frontend routes");
    expect(serialized).toContain("backend endpoint inventory");
    expect(serialized).toContain("backend_selected_files");
    expect(serialized).toContain("frontend API clients");
    expect(serialized).toContain("model/schema/type files that define params/query/body objects");
    expect(serialized).toContain("database model/schema files");
    expect(serialized).toContain("enum/constant files");
    expect(serialized).toContain("do not select seed files");
    expect(serialized).toContain("Notifications component");
    expect(serialized).toContain("src/routes.tsx");
    expect(body).toMatchObject({
      model: "gpt-5.4-2026-03-05",
      text: {
        format: {
          type: "json_schema",
          name: "atlas_route_file_selection",
          strict: true
        }
      }
    });
  });

  it("filters hallucinated file selection paths", () => {
    const responseText = openAIResponseText({
      selected_files: ["src/App.tsx", "missing.tsx", "src/App.tsx"],
      context_files: ["src/routes.tsx", "missing.tsx", "src/routes.tsx"],
      backend_selected_files: ["apps/api/src/tasks.ts", "missing.ts"],
      backend_context_files: ["src/api.ts", "missing.ts"]
    });

    expect(parseAtlasFileSelectionResponse(responseText, ["src/App.tsx", "src/routes.tsx", "apps/api/src/tasks.ts", "src/api.ts"])).toEqual({
      selectedFiles: ["src/App.tsx"],
      contextFiles: ["src/routes.tsx"],
      backendSelectedFiles: ["apps/api/src/tasks.ts"],
      backendContextFiles: ["src/api.ts"]
    });
  });

  it("builds a strict JSON route-map generation request", () => {
    const body = buildAtlasRouteMapRequestBody(config, {
      projectId: "proj_test",
      files: [
        {
          path: "src/routes.tsx",
          chunk_index: 0,
          chunk_count: 1,
          content: "<Route path=\"/dashboard\" element={<Dashboard />} />"
        }
      ]
    });

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("frontend route documentation generator");
    expect(serialized).toContain("real user-visible frontend routes only");
    expect(serialized).toContain("endpoint-like paths");
    expect(serialized).toContain("empty routes array");
    expect(serialized).toContain("source_file_chunks");
    expect(serialized).toContain("/dashboard");
    expect(serialized).toContain("atlas_route_map");
    expect(serialized).not.toContain("ui_model");
    expect(serialized).not.toContain("affordances");
  });

  it("builds a backend inventory request", () => {
    const body = buildAtlasBackendInventoryRequestBody(config, {
      projectId: "proj_test",
      files: [
        {
          path: "apps/api/src/tasks.ts",
          chunk_index: 0,
          chunk_count: 1,
          content: "app.post('/api/tasks', async () => {})"
        }
      ]
    });

    const serialized = JSON.stringify(body);
    expect(serialized).toContain("backend endpoint inventory generator");
    expect(serialized).toContain("app-facing backend endpoints");
    expect(serialized).toContain("health checks");
    expect(serialized).toContain("\"enum\"");
    expect(serialized).toContain("one to three sentences");
    expect(serialized).toContain("main action, important scope/filtering behavior");
    expect(serialized).toContain("database schema enum constraints");
    expect(serialized).toContain("do not use seed/reference data");
    expect(serialized).toContain("source_file_chunks");
    expect(serialized).toContain("atlas_backend_inventory");
  });

  it("parses and normalizes generated route docs", () => {
    const responseText = openAIResponseText({
      routes: [
        { path: "/", summary: "Home page." },
        { path: "dashboard", summary: "Dashboard overview." },
        { path: "/dashboard", summary: "Duplicate." },
        { path: "", summary: "Ignore." }
      ]
    });

    expect(parseAtlasRouteMapResponse(responseText)).toEqual({
      routes: [
        { path: "/", summary: "Home page." },
        { path: "/dashboard", summary: "Dashboard overview." }
      ]
    });
  });

  it("parses and normalizes generated backend inventories", () => {
    const responseText = openAIResponseText({
      endpoints: [
        {
          method: "get",
          path: "api/tasks",
          summary: "Lists tasks.",
          auth: "requires user session cookie",
          request: {
            query: {
              projectId: { type: "string", required: false },
              status: { type: "string", required: false, enum: ["open", "done", "open"] }
            }
          },
          response: {
            success: "200 with task list",
            errors: ["401 unauthenticated"]
          }
        },
        {
          method: "GET",
          path: "/api/tasks",
          summary: "Duplicate.",
          auth: "requires user session cookie",
          request: {},
          response: {
            success: "200 with task list",
            errors: []
          }
        },
        {
          method: "POST",
          path: "",
          summary: "Ignore.",
          auth: "requires user session cookie",
          request: {},
          response: {
            success: "204 No Content",
            errors: []
          }
        }
      ]
    });

    expect(parseAtlasBackendInventoryResponse(responseText)).toEqual({
      endpoints: [
        {
          method: "GET",
          path: "/api/tasks",
          summary: "Lists tasks.",
          auth: "requires user session cookie",
          request: {
            query: {
              projectId: { type: "string", required: false },
              status: { type: "string", required: false, enum: ["open", "done"] }
            }
          },
          response: {
            success: "200 with task list",
            errors: ["401 unauthenticated"]
          }
        }
      ]
    });
  });

  it("uses the Atlas model for OpenAI file selection and route-map generation", async () => {
    const selectionFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.openai.com/v1/responses");
      expect(init?.headers).toMatchObject({ authorization: "Bearer openai" });
      expect(String(init?.body)).toContain("\"model\":\"gpt-5.4-2026-03-05\"");
      return new Response(openAIResponseText({
        selected_files: ["src/App.tsx"],
        context_files: [],
        backend_selected_files: ["apps/api/src/tasks.ts"],
        backend_context_files: []
      }));
    };

    await expect(selectAtlasDocumentationFiles(config, ["src/App.tsx", "apps/api/src/tasks.ts"], selectionFetch)).resolves.toMatchObject({
      selectedFiles: ["src/App.tsx"],
      backendSelectedFiles: ["apps/api/src/tasks.ts"]
    });

    const routeMapFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(init?.body)).toContain("source_file_chunks");
      return new Response(openAIResponseText({ routes: [{ path: "/", summary: "Home page." }] }));
    };

    await expect(
      generateAtlasRouteMap(config, {
        projectId: "proj_test",
        files: [{ path: "src/App.tsx", chunk_index: 0, chunk_count: 1, content: "source" }]
      }, routeMapFetch)
    ).resolves.toMatchObject({
      documentation: {
        version: 1,
        project_id: "proj_test",
        source_files: ["src/App.tsx"],
        routes: [{ path: "/", summary: "Home page." }]
      }
    });

    const backendFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(init?.body)).toContain("backend endpoint inventory");
      return new Response(openAIResponseText({
        endpoints: [
          {
            method: "GET",
            path: "/api/tasks",
            summary: "Lists tasks.",
            auth: "requires user session cookie",
            request: {},
            response: {
              success: "200 with task list",
              errors: []
            }
          }
        ]
      }));
    };

    await expect(
      generateAtlasBackendInventory(config, {
        projectId: "proj_test",
        files: [{ path: "apps/api/src/tasks.ts", chunk_index: 0, chunk_count: 1, content: "source" }]
      }, backendFetch)
    ).resolves.toMatchObject({
      documentation: {
        version: 1,
        project_id: "proj_test",
        source_files: ["apps/api/src/tasks.ts"],
        endpoints: [{ method: "GET", path: "/api/tasks" }]
      }
    });
  });

  it("parses OpenAI token usage metadata", () => {
    expect(parseAtlasTokenUsage(JSON.stringify({
      usage: {
        input_tokens: 120,
        input_tokens_details: {
          cached_tokens: 20
        },
        output_tokens: 30,
        total_tokens: 150
      }
    }), "gpt-5.4-2026-03-05")).toEqual({
      input_tokens: 120,
      cached_input_tokens: 20,
      output_tokens: 30,
      total_tokens: 150,
      pricing: {
        model: "gpt-5.4",
        input_usd: 0.00025,
        cached_input_usd: 0.000005,
        output_usd: 0.00045,
        total_usd: 0.000705
      }
    });
  });
});

function openAIResponseText(payload: unknown): string {
  return JSON.stringify({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(payload)
          }
        ]
      }
    ]
  });
}
