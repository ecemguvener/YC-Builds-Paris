import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { buildApp } from "../app.js";
import type { AppConfig } from "../config.js";
import type { ApiKeyDocument, AtlasProjectDocument, Collections, UserDocument } from "../db.js";
import { hashApiKey } from "../security.js";
import { registerAtlasAgentForTest } from "./agent-bridge.js";

const baseConfig: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 4000,
  PUBLIC_APP_URL: "http://localhost:5173",
  PUBLIC_API_URL: "http://localhost:4000",
  MONGODB_URI: "mongodb://127.0.0.1:27017/barkan-web-test",
  SESSION_COOKIE_NAME: "barkan_session",
  SESSION_SECRET: "test-barkan-session-secret",
  ELEVENLABS_VOICE_ID: "voice_test",
  OPENAI_API_KEY: "openai",
  OPENAI_WIDGET_MODEL: "gpt-5.4-2026-03-05",
  OPENAI_ACTION_MODEL: "gpt-5.4-2026-03-05",
  OPENAI_ATLAS_MODEL: "gpt-5.4-2026-03-05"
};

describe("atlas routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects frontend files for an owned project without storing source", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const existingProject = createProject(user._id, "proj_existing");
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(String(init?.body)).toContain("src/App.tsx");
      return new Response(openAIResponseText({
        selected_files: ["src/App.tsx"],
        context_files: [],
        backend_selected_files: ["apps/api/src/tasks.ts"],
        backend_context_files: ["src/api.ts"]
      }), {
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const uploadDocument = vi.fn();
    const app = await buildApp(baseConfig, createCollections({ apiKey, user, existingProject, uploadDocument }));

    const response = await app.inject({
      method: "POST",
      url: "/api/atlas/agent/select-files",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        project_id: "proj_existing",
        file_paths: ["src/App.tsx", "apps/api/src/tasks.ts", "src/api.ts", "README.md"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      selected_files: ["src/App.tsx"],
      context_files: [],
      backend_selected_files: ["apps/api/src/tasks.ts"],
      backend_context_files: ["src/api.ts"]
    });
    expect(uploadDocument).not.toHaveBeenCalled();

    await app.close();
  });

  it("generates a backend endpoint batch for an owned project", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const existingProject = createProject(user._id, "proj_existing");
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(String(init?.body)).toContain("backend endpoint inventory");
      return new Response(openAIResponseText({
        endpoints: [
          {
            method: "POST",
            path: "/api/tasks",
            summary: "Creates a task for the signed-in user.",
            auth: "requires user session cookie",
            request: {
              body: {
                title: { type: "string", required: true },
                dueDate: { type: "YYYY-MM-DD", required: false }
              }
            },
            response: {
              success: "201 with created task object",
              errors: ["400 invalid body", "401 unauthenticated"]
            }
          }
        ]
      }), {
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(baseConfig, createCollections({ apiKey, user, existingProject }));

    const response = await app.inject({
      method: "POST",
      url: "/api/atlas/agent/generate-backend-batch",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        project_id: "proj_existing",
        files: [{ path: "apps/api/src/tasks.ts", chunk_index: 0, chunk_count: 1, content: "app.post('/api/tasks')" }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      documentation: {
        project_id: "proj_existing",
        source_files: ["apps/api/src/tasks.ts"],
        endpoints: [
          {
            method: "POST",
            path: "/api/tasks",
            request: {
              body: {
                title: { type: "string", required: true },
                dueDate: { type: "YYYY-MM-DD", required: false }
              }
            }
          }
        ]
      }
    });

    await app.close();
  });

  it("generates a route batch for an owned project without accepting final route-map uploads", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const existingProject = createProject(user._id, "proj_existing");
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(String(init?.body)).toContain("source_file_chunks");
      return new Response(openAIResponseText({ routes: [{ path: "/", summary: "Home page." }] }), {
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(baseConfig, createCollections({ apiKey, user, existingProject }));

    const response = await app.inject({
      method: "POST",
      url: "/api/atlas/agent/generate-route-batch",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        project_id: "proj_existing",
        files: [{ path: "src/App.tsx", chunk_index: 0, chunk_count: 1, content: "export default function Home() {}" }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      documentation: {
        project_id: "proj_existing",
        source_files: ["src/App.tsx"],
        routes: [{ path: "/", summary: "Home page." }]
      }
    });

    await app.close();
  });

  it("rejects agent AI requests when the API key is bound to a different project", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const existingProject = createProject(user._id, "proj_allowed");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({
        apiKey,
        user,
        existingProject,
        apiKeyProjectId: "proj_allowed"
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/atlas/agent/select-files",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        project_id: "proj_other",
        file_paths: ["src/App.tsx"]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("API key is not authorized for this project");
    expect(fetchMock).not.toHaveBeenCalled();

    const backendResponse = await app.inject({
      method: "POST",
      url: "/api/atlas/agent/generate-backend-batch",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        project_id: "proj_other",
        files: [{ path: "apps/api/src/tasks.ts", chunk_index: 0, chunk_count: 1, content: "source" }]
      }
    });

    expect(backendResponse.statusCode).toBe(403);
    expect(backendResponse.json().error).toBe("API key is not authorized for this project");
    expect(fetchMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("repairs a blank site project id during CLI connect", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const siteId = new ObjectId();
    const existingProject = {
      ...createProject(user._id, ""),
      siteId
    } as AtlasProjectDocument;
    const app = await buildApp(
      baseConfig,
      createCollections({
        apiKey,
        user,
        existingProject,
        apiKeySiteId: siteId
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/atlas/connect",
      headers: { authorization: `Bearer ${apiKey}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().project.id).toMatch(/^proj_/);
    expect(response.json().project.id).not.toBe("");

    await app.close();
  });

  it("treats a blank API key project binding as unbound during CLI connect", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const siteId = new ObjectId();
    const existingProject = {
      ...createProject(user._id, "proj_site"),
      siteId
    } as AtlasProjectDocument;
    const app = await buildApp(
      baseConfig,
      createCollections({
        apiKey,
        user,
        existingProject,
        apiKeyProjectId: "",
        apiKeySiteId: siteId
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/atlas/connect",
      headers: { authorization: `Bearer ${apiKey}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().project.id).toMatch(/^proj_/);
    expect(response.json().project.id).not.toBe("");

    await app.close();
  });

  it("returns live local agent status for the API key project", async () => {
    const apiKey = "ck_test";
    const user = createUser();
    const existingProject = createProject(user._id, "proj_existing");
    const unregisterAgent = registerAtlasAgentForTest(existingProject.projectId, async () => ({
      routeMap: {
        version: 1,
        project_id: existingProject.projectId,
        generated_at: "2026-05-18T10:00:00.000Z",
        source_files: [],
        routes: []
      },
      backendInventory: {
        version: 1,
        project_id: existingProject.projectId,
        generated_at: "2026-05-18T10:00:00.000Z",
        source_files: [],
        endpoints: []
      }
    }));
    const app = await buildApp(
      baseConfig,
      createCollections({
        apiKey,
        user,
        existingProject,
        apiKeyProjectId: existingProject.projectId
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/atlas/agent/status",
      headers: { authorization: `Bearer ${apiKey}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      project: {
        id: "proj_existing",
        name: "Test Atlas project"
      },
      agent: {
        connected: true,
        connectedAt: "1970-01-01T00:00:00.000Z"
      }
    });

    unregisterAgent();
    await app.close();
  });
});

function createCollections({
  apiKey = "ck_test",
  user = createUser(),
  existingProject = null,
  apiKeyProjectId,
  apiKeySiteId,
  uploadDocument = vi.fn()
}: {
  apiKey?: string;
  user?: UserDocument;
  existingProject?: AtlasProjectDocument | null;
  apiKeyProjectId?: string;
  apiKeySiteId?: ObjectId;
  uploadDocument?: ReturnType<typeof vi.fn>;
} = {}): Collections {
  const apiKeyDocument: ApiKeyDocument = {
    _id: new ObjectId(),
    userId: user._id,
    keyHash: hashApiKey(apiKey),
    prefix: "ck_test",
    name: "CLI key",
    projectId: apiKeyProjectId,
    ...(apiKeySiteId ? { siteId: apiKeySiteId } : {}),
    createdAt: new Date()
  };

  return {
    apiKeys: {
      findOne: vi.fn().mockImplementation(({ keyHash }: { keyHash: string }) =>
        keyHash === apiKeyDocument.keyHash ? Promise.resolve(apiKeyDocument) : Promise.resolve(null)
      ),
      updateOne: vi.fn()
    },
    users: {
      findOne: vi.fn().mockResolvedValue(user)
    },
    sites: {
      findOne: vi.fn().mockImplementation(({ _id }: { _id: ObjectId }) =>
        apiKeySiteId && _id.equals(apiKeySiteId)
          ? Promise.resolve({ _id: apiKeySiteId, ownerUserId: user._id, name: "Demo", domain: "demo.test" })
          : Promise.resolve(null)
      )
    },
    atlasProjects: {
      findOne: vi.fn().mockImplementation((filter: { projectId?: string; siteId?: ObjectId }) => {
        if (!existingProject) {
          return Promise.resolve(null);
        }
        if (filter.projectId && filter.projectId !== existingProject.projectId) {
          return Promise.resolve(null);
        }
        if (filter.siteId && !existingProject.siteId?.equals(filter.siteId)) {
          return Promise.resolve(null);
        }
        return Promise.resolve(existingProject);
      }),
      insertOne: vi.fn(),
      updateOne: vi.fn().mockImplementation((_filter: unknown, update: { $set?: Partial<AtlasProjectDocument> }) => {
        if (existingProject && update.$set) {
          Object.assign(existingProject, update.$set);
        }

        return Promise.resolve({ matchedCount: existingProject ? 1 : 0, modifiedCount: existingProject ? 1 : 0 });
      })
    },
    atlasDocuments: {
      updateOne: uploadDocument,
      findOne: vi.fn()
    },
    sessions: {},
    interactionLogs: {}
  } as unknown as Collections;
}

function createUser(): UserDocument {
  return {
    _id: new ObjectId(),
    email: "test@example.com",
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function createProject(ownerUserId: ObjectId, projectId: string): AtlasProjectDocument {
  return {
    _id: new ObjectId(),
    ownerUserId,
    projectId,
    name: "Test Atlas project",
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
