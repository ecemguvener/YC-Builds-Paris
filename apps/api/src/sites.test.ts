import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { ApiKeyDocument, AtlasDocumentDocument, AtlasProjectDocument, Collections, SiteDocument, UserDocument } from "./db.js";
import { registerAtlasAgentForTest, type AtlasDocumentationBundle } from "./atlas/agent-bridge.js";
import { hashApiKey, hashSessionToken, SITE_PREVIEW_IMAGES } from "./security.js";
import { buildSnippet } from "./sites.js";

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

describe("site snippets", () => {
  it("builds an embeddable public-key snippet", () => {
    expect(buildSnippet("https://app.example.com/", "site_public")).toBe(
      '<script async src="https://app.example.com/widget.js" data-barkan-site="site_public"></script>'
    );
  });

  it("creates a site-scoped CLI API key", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const insertedApiKeys: Array<{ keyHash: string; siteId?: ObjectId; userId: ObjectId; projectId?: string }> = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        insertApiKey: (apiKey) => insertedApiKeys.push(apiKey)
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/sites/${String(site._id)}/api-keys`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      },
      payload: {
        name: "CLI key"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().secret).toMatch(/^ck_/);
    expect(response.json().apiKey.name).toBe("CLI key");
    expect(response.json().apiKey.lastUsedAt).toBeNull();
    expect(insertedApiKeys[0]?.siteId).toEqual(site._id);
    expect(insertedApiKeys[0]?.userId).toEqual(user._id);
    expect(insertedApiKeys[0]?.projectId).toMatch(/^proj_/);
    expect(insertedApiKeys[0]?.keyHash).toBe(hashApiKey(response.json().secret));

    await app.close();
  });

  it("does not create sites through the deprecated direct create route", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const insertedSites: SiteDocument[] = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site: null,
        insertSite: (site) => insertedSites.push(site),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/sites",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      },
      payload: {
        name: "Early site",
        domain: "early.example"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("complete documentation");
    expect(insertedSites).toHaveLength(0);

    await app.close();
  });

  it("creates a pending setup and CLI key without creating a site", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const insertedSites: SiteDocument[] = [];
    const insertedAtlasProjects: AtlasProjectDocument[] = [];
    const insertedApiKeys: Array<{ keyHash: string; siteId?: ObjectId; userId: ObjectId; projectId?: string }> = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site: null,
        insertSite: (site) => insertedSites.push(site),
        insertAtlasProject: (project) => insertedAtlasProjects.push(project),
        insertApiKey: (apiKey) => insertedApiKeys.push(apiKey)
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/site-setups",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      },
      payload: {
        name: "Alumet",
        domain: "https://Alumet.example/dashboard"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().setup).toMatchObject({
      projectId: expect.stringMatching(/^proj_/),
      name: "Alumet",
      domain: "alumet.example"
    });
    expect(response.json().secret).toMatch(/^ck_/);
    expect(insertedSites).toHaveLength(0);
    expect(insertedAtlasProjects).toHaveLength(1);
    expect(insertedAtlasProjects[0]).toMatchObject({
      ownerUserId: user._id,
      pendingSiteDomain: "alumet.example"
    });
    expect(insertedAtlasProjects[0]?.siteId).toBeUndefined();
    expect(insertedApiKeys[0]).toMatchObject({
      userId: user._id,
      projectId: response.json().setup.projectId
    });
    expect(insertedApiKeys[0]?.siteId).toBeUndefined();

    await app.close();
  });

  it("blocks credentialed site setup requests from untrusted origins", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const insertedAtlasProjects: AtlasProjectDocument[] = [];
    const insertedApiKeys: Array<{ keyHash: string; siteId?: ObjectId; userId: ObjectId; projectId?: string }> = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site: null,
        insertAtlasProject: (project) => insertedAtlasProjects.push(project),
        insertApiKey: (apiKey) => insertedApiKeys.push(apiKey)
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/site-setups",
      headers: {
        origin: "https://evil.example"
      },
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      },
      payload: {
        name: "Alumet",
        domain: "https://alumet.example"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(insertedAtlasProjects).toHaveLength(0);
    expect(insertedApiKeys).toHaveLength(0);

    await app.close();
  });

  it("refuses to complete a setup before documentation exists without creating a site", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const atlasProject = createPendingAtlasProject(user._id, "proj_pending1");
    const insertedSites: SiteDocument[] = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site: null,
        atlasProject,
        insertSite: (site) => insertedSites.push(site),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/site-setups/proj_pending1/complete",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("Generate documentation");
    expect(insertedSites).toHaveLength(0);

    await app.close();
  });

  it("can complete a setup without documentation when skipped", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const atlasProject = createPendingAtlasProject(user._id, "proj_pending1");
    const apiKey: ApiKeyDocument = {
      _id: new ObjectId(),
      userId: user._id,
      projectId: atlasProject.projectId,
      keyHash: "hidden_hash",
      prefix: "ck_pending",
      name: "Pending CLI key",
      createdAt: new Date("2026-05-18T10:00:00.000Z")
    } as ApiKeyDocument;
    const insertedSites: SiteDocument[] = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site: null,
        atlasProject,
        apiKeys: [apiKey],
        insertSite: (site) => insertedSites.push(site),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/site-setups/proj_pending1/complete",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      },
      payload: {
        skipDocumentation: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(insertedSites).toHaveLength(1);
    expect(response.json().site).toMatchObject({
      id: String(insertedSites[0]?._id),
      name: "Pending site",
      domain: "pending.example"
    });
    expect(response.json().documentation).toBeNull();
    expect(response.json().backendDocumentation).toBeNull();
    expect(apiKey.siteId).toEqual(insertedSites[0]?._id);

    await app.close();
  });

  it("creates the site only when completing a documented setup", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const atlasProject = createPendingAtlasProject(user._id, "proj_pending1");
    const apiKey: ApiKeyDocument = {
      _id: new ObjectId(),
      userId: user._id,
      projectId: atlasProject.projectId,
      keyHash: "hidden_hash",
      prefix: "ck_pending",
      name: "Pending CLI key",
      createdAt: new Date("2026-05-18T10:00:00.000Z")
    } as ApiKeyDocument;
    const insertedSites: SiteDocument[] = [];
    const updatedApiKeyFilters: unknown[] = [];
    const documentation = {
      version: 1,
      project_id: atlasProject.projectId,
      generated_at: "2026-05-18T10:00:00.000Z",
      source_files: ["src/App.tsx"],
      routes: [{ path: "/", summary: "Home." }]
    };
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site: null,
        atlasProject,
        atlasDocument: createAtlasDocumentationDocument(user._id, atlasProject.projectId, documentation),
        apiKeys: [apiKey],
        insertSite: (site) => insertedSites.push(site),
        insertApiKey: () => undefined,
        updateApiKeys: (filter) => updatedApiKeyFilters.push(filter)
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/site-setups/proj_pending1/complete",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(insertedSites).toHaveLength(1);
    expect(insertedSites[0]).toMatchObject({
      ownerUserId: user._id,
      name: "Pending site",
      domain: "pending.example"
    });
    expect(SITE_PREVIEW_IMAGES).toContain(insertedSites[0]?.previewImage);
    expect(updatedApiKeyFilters[0]).toEqual({
      userId: user._id,
      projectId: atlasProject.projectId
    });
    expect(apiKey.siteId).toEqual(insertedSites[0]?._id);
    expect(response.json().site).toMatchObject({
      id: String(insertedSites[0]?._id),
      name: "Pending site",
      domain: "pending.example"
    });
    expect(response.json().snippet).toContain(`data-barkan-site="${insertedSites[0]?.publicSiteKey}"`);
    expect(response.json().documentation).toEqual(documentation);

    await app.close();
  });

  it("repairs a blank Atlas project id when creating a site-scoped CLI API key", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "");
    const insertedApiKeys: Array<{ keyHash: string; siteId?: ObjectId; userId: ObjectId; projectId?: string }> = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: (apiKey) => insertedApiKeys.push(apiKey)
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/sites/${String(site._id)}/api-keys`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      },
      payload: {
        name: "CLI key"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(insertedApiKeys[0]?.projectId).toMatch(/^proj_/);
    expect(insertedApiKeys[0]?.projectId).not.toBe("");

    await app.close();
  });

  it("returns masked API key metadata with site detail", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const apiKeyCreatedAt = new Date("2026-05-17T10:00:00.000Z");
    const apiKeyLastUsedAt = new Date("2026-05-17T11:00:00.000Z");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        apiKeys: [
          {
            _id: new ObjectId(),
            userId: user._id,
            siteId: site._id,
            keyHash: "hidden_hash",
            prefix: "ck_abcd123",
            name: "CLI key",
            createdAt: apiKeyCreatedAt,
            lastUsedAt: apiKeyLastUsedAt
          }
        ],
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().apiKeys).toEqual([
      {
        id: expect.any(String),
        name: "CLI key",
        prefix: "ck_abcd123",
        createdAt: apiKeyCreatedAt.toISOString(),
        lastUsedAt: apiKeyLastUsedAt.toISOString()
      }
    ]);
    expect(response.json().documentation).toBeNull();
    expect(response.json().sourceContext).toBeNull();
    expect(JSON.stringify(response.json())).not.toContain("hidden_hash");

    await app.close();
  });

  it("returns saved Atlas documentation with site detail", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const documentation = {
      version: 1,
      project_id: "proj_site",
      generated_at: "2026-05-17T10:00:00.000Z",
      source_files: ["src/routes.tsx"],
      routes: [
        {
          path: "/dashboard",
          summary: "Dashboard overview."
        }
      ]
    };
    const backendDocumentation = createBackendInventory("proj_site");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        atlasDocument: createAtlasDocumentationDocument(user._id, atlasProject.projectId, documentation, backendDocumentation),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().documentation).toEqual(documentation);
    expect(response.json().backendDocumentation).toEqual(backendDocumentation);

    await app.close();
  });

  it("returns local documentation agent status with site detail", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const unregisterAgent = registerAtlasAgentForTest(atlasProject.projectId, async () => ({
      routeMap: {
        version: 1,
        project_id: atlasProject.projectId,
        generated_at: "2026-05-18T10:00:00.000Z",
        source_files: [],
        routes: []
      },
      backendInventory: createBackendInventory(atlasProject.projectId)
    }));
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sourceContext).toBeNull();
    expect(response.json().documentationAgent).toEqual({
      projectId: "proj_site",
      connected: true,
      connectedAt: "1970-01-01T00:00:00.000Z"
    });

    unregisterAgent();
    await app.close();
  });

  it("returns only local documentation agent status for one-shot checks", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const unregisterAgent = registerAtlasAgentForTest(atlasProject.projectId, async () => ({
      routeMap: {
        version: 1,
        project_id: atlasProject.projectId,
        generated_at: "2026-05-18T10:00:00.000Z",
        source_files: [],
        routes: []
      },
      backendInventory: createBackendInventory(atlasProject.projectId)
    }));
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}/documentation-agent`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      documentationAgent: {
        projectId: "proj_site",
        connected: true,
        connectedAt: "1970-01-01T00:00:00.000Z"
      }
    });
    expect(response.json()).not.toHaveProperty("documentation");
    expect(response.json()).not.toHaveProperty("backendDocumentation");

    unregisterAgent();
    await app.close();
  });

  it("generates documentation through the local agent and streams the three web steps", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const upsertedDocuments: unknown[] = [];
    const unregisterAgent = registerAtlasAgentForTest(atlasProject.projectId, async (onEvent) => {
      onEvent({ type: "step_started", step: "files_selection", total: 2 });
      onEvent({ type: "step_progress", step: "files_selection", current: 1, total: 2, label: "1/2 batches" });
      onEvent({ type: "step_completed", step: "files_selection", current: 2, total: 2 });
      onEvent({ type: "step_started", step: "frontend_documentation", total: 2 });
      onEvent({ type: "step_progress", step: "frontend_documentation", current: 1, total: 2, label: "1/2 files" });
      onEvent({ type: "step_completed", step: "frontend_documentation", current: 2, total: 2 });
      onEvent({ type: "step_started", step: "backend_documentation", total: 1 });
      onEvent({ type: "step_progress", step: "backend_documentation", current: 1, total: 1, label: "1/1 batches" });
      onEvent({ type: "step_completed", step: "backend_documentation", current: 1, total: 1 });
      return {
        routeMap: {
          version: 1,
          project_id: atlasProject.projectId,
          generated_at: "2026-05-18T10:00:00.000Z",
          source_files: ["src/App.tsx"],
          routes: [
            { path: "/", summary: "Home page." },
            { path: "/dashboard", summary: "Dashboard overview." }
          ]
        },
        backendInventory: createBackendInventory(atlasProject.projectId)
      };
    });

    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined,
        updateAtlasDocument: (update) => upsertedDocuments.push(update)
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/sites/${String(site._id)}/documentation/generate`,
      headers: {
        origin: "http://localhost:5173"
      },
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.payload).toContain("event: step_started\ndata: {\"type\":\"step_started\",\"step\":\"files_selection\",\"total\":2}");
    expect(response.payload).toContain("event: step_progress\ndata: {\"type\":\"step_progress\",\"step\":\"frontend_documentation\",\"current\":1,\"total\":2");
    expect(response.payload).toContain("event: step_progress\ndata: {\"type\":\"step_progress\",\"step\":\"backend_documentation\",\"current\":1,\"total\":1");
    expect(response.payload).toContain("event: completed");
    expect(response.payload).toContain("\"path\":\"/dashboard\"");
    expect(response.payload).toContain("\"backendDocumentation\"");
    expect(JSON.stringify(upsertedDocuments)).toContain("\"type\":\"documentation\"");
    expect(JSON.stringify(upsertedDocuments)).toContain("\"frontend\"");
    expect(JSON.stringify(upsertedDocuments)).toContain("\"backend\"");
    expect(upsertedDocuments).toHaveLength(1);

    unregisterAgent();
    await app.close();
  });

  it("returns running documentation generation state with site detail", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    let resolveGenerationStarted!: () => void;
    let finishGeneration!: (documentation: AtlasDocumentationBundle) => void;
    const generationStarted = new Promise<void>((resolve) => {
      resolveGenerationStarted = resolve;
    });
    const generationFinished = new Promise<AtlasDocumentationBundle>((resolve) => {
      finishGeneration = resolve;
    });
    const unregisterAgent = registerAtlasAgentForTest(atlasProject.projectId, async (onEvent) => {
      onEvent({ type: "step_started", step: "frontend_documentation", total: 2 });
      onEvent({ type: "step_progress", step: "frontend_documentation", current: 1, total: 2, label: "1/2 files" });
      resolveGenerationStarted();
      return await generationFinished;
    });
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined,
        updateAtlasDocument: () => undefined
      })
    );

    const generationRequest = app.inject({
      method: "POST",
      url: `/api/sites/${String(site._id)}/documentation/generate`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });
    await generationStarted;

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().documentationGeneration).toMatchObject({
      projectId: "proj_site",
      status: "running",
      activeStep: "frontend_documentation",
      completedSteps: ["connection"],
      stepProgress: {
        connection: { current: 1, total: 1, label: "Connected" },
        frontend_documentation: { current: 1, total: 2, label: "1/2 files" }
      }
    });

    finishGeneration({
      routeMap: {
        version: 1,
        project_id: atlasProject.projectId,
        generated_at: "2026-05-18T10:00:00.000Z",
        source_files: [],
        routes: []
      },
      backendInventory: createBackendInventory(atlasProject.projectId)
    });
    await generationRequest;
    unregisterAgent();
    await app.close();
  });

  it("refuses web documentation generation without a connected local agent", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/sites/${String(site._id)}/documentation/generate`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("npx barkan connect");

    await app.close();
  });

  it("refuses web documentation generation without a session", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/sites/${String(site._id)}/documentation/generate`
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("returns project documentation by Atlas project id for the owner", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const documentation = {
      version: 1,
      project_id: "proj_site",
      generated_at: "2026-05-17T10:00:00.000Z",
      source_files: ["src/App.tsx"],
      routes: [
        {
          path: "/",
          summary: "Shows home."
        }
      ]
    };
    const backendDocumentation = createBackendInventory("proj_site");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        atlasDocument: createAtlasDocumentationDocument(user._id, atlasProject.projectId, documentation, backendDocumentation),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/atlas/projects/proj_site/documentation",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      project: {
        id: "proj_site",
        name: "Test Atlas project"
      },
      site: {
        id: String(site._id),
        name: "Test site"
      },
      documentation,
      backendDocumentation
    });

    await app.close();
  });

  it("returns null documentation for an existing project without an Atlas document", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_empty");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/atlas/projects/proj_empty/documentation",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().documentation).toBeNull();
    expect(response.json().backendDocumentation).toBeNull();

    await app.close();
  });

  it("does not expose project documentation from another user", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const otherUser = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(otherUser._id, site._id, "proj_other_user");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        atlasDocument: createAtlasDocument(otherUser._id, atlasProject.projectId, { project_id: "proj_other_user" }),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/atlas/projects/proj_other_user/documentation",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("returns 404 for an unknown Atlas project", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/atlas/projects/proj_missing/documentation",
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("does not expose Atlas documentation from another site", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const otherSiteId = new ObjectId();
    const atlasProject = createAtlasProject(user._id, otherSiteId, "proj_other");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        atlasDocument: createAtlasDocument(user._id, atlasProject.projectId, { project_id: "proj_other" }),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().documentation).toBeNull();

    await app.close();
  });

  it("does not expose Atlas documentation from another user", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const otherUser = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(otherUser._id, site._id, "proj_other_user");
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        atlasDocument: createAtlasDocument(otherUser._id, atlasProject.projectId, { project_id: "proj_other_user" }),
        insertApiKey: () => undefined
      })
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().documentation).toBeNull();

    await app.close();
  });

  it("deletes a site-scoped CLI API key", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const apiKeyId = new ObjectId();
    const deletedApiKeyFilters: Array<{ _id: ObjectId; siteId?: ObjectId; userId: ObjectId }> = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        insertApiKey: () => undefined,
        deleteApiKey: (filter) => {
          deletedApiKeyFilters.push(filter);
          return (
            filter._id.equals(apiKeyId) &&
            filter.siteId?.equals(site._id) &&
            filter.userId.equals(user._id)
          );
        }
      })
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/sites/${String(site._id)}/api-keys/${String(apiKeyId)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(deletedApiKeyFilters[0]).toEqual({
      _id: apiKeyId,
      siteId: site._id,
      userId: user._id
    });

    await app.close();
  });

  it("deletes a site and its site-scoped records", async () => {
    const sessionToken = "session_test";
    const user = createUser();
    const site = createSite(user._id);
    const atlasProject = createAtlasProject(user._id, site._id, "proj_site");
    const deletedSiteFilters: Array<{ _id: ObjectId; ownerUserId: ObjectId }> = [];
    const deletedApiKeyFilters: Array<{ siteId?: ObjectId; userId: ObjectId }> = [];
    const deletedAtlasProjectFilters: Array<{ siteId?: ObjectId; ownerUserId: ObjectId }> = [];
    const deletedAtlasDocumentFilters: Array<{ ownerUserId: ObjectId; projectId: { $in: string[] } }> = [];
    const deletedInteractionLogFilters: Array<{ siteId: ObjectId }> = [];
    const app = await buildApp(
      baseConfig,
      createCollections({
        sessionToken,
        user,
        site,
        atlasProject,
        insertApiKey: () => undefined,
        deleteSite: (filter) => {
          deletedSiteFilters.push(filter);
          return filter._id.equals(site._id) && filter.ownerUserId.equals(user._id);
        },
        deleteSiteApiKeys: (filter) => {
          deletedApiKeyFilters.push(filter);
        },
        deleteSiteAtlasProjects: (filter) => {
          deletedAtlasProjectFilters.push(filter);
        },
        deleteSiteAtlasDocuments: (filter) => {
          deletedAtlasDocumentFilters.push(filter);
        },
        deleteSiteInteractionLogs: (filter) => {
          deletedInteractionLogFilters.push(filter);
        }
      })
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/sites/${String(site._id)}`,
      cookies: {
        [baseConfig.SESSION_COOKIE_NAME]: sessionToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(deletedSiteFilters[0]).toEqual({
      _id: site._id,
      ownerUserId: user._id
    });
    expect(deletedApiKeyFilters[0]).toEqual({
      userId: user._id,
      siteId: site._id
    });
    expect(deletedAtlasProjectFilters[0]).toEqual({
      ownerUserId: user._id,
      siteId: site._id
    });
    expect(deletedAtlasDocumentFilters[0]).toEqual({
      ownerUserId: user._id,
      projectId: { $in: ["proj_site"] }
    });
    expect(deletedInteractionLogFilters[0]).toEqual({
      siteId: site._id
    });

    await app.close();
  });
});

function createCollections({
  sessionToken,
  user,
  site,
  apiKeys = [],
  atlasProject = null,
  atlasDocument = null,
  insertSite = () => undefined,
  insertAtlasProject = () => undefined,
  insertApiKey,
  updateApiKeys = () => undefined,
  updateAtlasDocument = () => undefined,
  deleteApiKey = () => false,
  deleteSite = () => false,
  deleteSiteApiKeys = () => undefined,
  deleteSiteAtlasProjects = () => undefined,
  deleteSiteAtlasDocuments = () => undefined,
  deleteSiteInteractionLogs = () => undefined
}: {
  sessionToken: string;
  user: UserDocument;
  site: SiteDocument | null;
  atlasProject?: AtlasProjectDocument | null;
  atlasDocument?: AtlasDocumentDocument | null;
  apiKeys?: ApiKeyDocument[];
  insertSite?: (site: SiteDocument) => void;
  insertAtlasProject?: (project: AtlasProjectDocument) => void;
  insertApiKey: (apiKey: { keyHash: string; siteId?: ObjectId; userId: ObjectId; projectId?: string }) => void;
  updateApiKeys?: (filter: { userId: ObjectId; projectId?: string }, update: { $set?: Partial<ApiKeyDocument> }) => void;
  updateAtlasDocument?: (update: unknown) => void;
  deleteApiKey?: (filter: { _id: ObjectId; siteId?: ObjectId; userId: ObjectId }) => boolean;
  deleteSite?: (filter: { _id: ObjectId; ownerUserId: ObjectId }) => boolean;
  deleteSiteApiKeys?: (filter: { siteId?: ObjectId; userId: ObjectId }) => void;
  deleteSiteAtlasProjects?: (filter: { siteId?: ObjectId; ownerUserId: ObjectId }) => void;
  deleteSiteAtlasDocuments?: (filter: { ownerUserId: ObjectId; projectId: { $in: string[] } }) => void;
  deleteSiteInteractionLogs?: (filter: { siteId: ObjectId }) => void;
}): Collections {
  let currentSite = site;
  let currentAtlasProject = atlasProject;
  const atlasDocuments = [atlasDocument].filter(
    (document): document is AtlasDocumentDocument => Boolean(document)
  );

  return {
    sessions: {
      findOne: vi.fn().mockImplementation(({ tokenHash }: { tokenHash: string }) =>
        tokenHash === hashSessionToken(sessionToken, baseConfig.SESSION_SECRET)
          ? Promise.resolve({ _id: new ObjectId(), userId: user._id, tokenHash })
          : Promise.resolve(null)
      )
    },
    users: {
      findOne: vi.fn().mockResolvedValue(user)
    },
    sites: {
      findOne: vi.fn().mockImplementation(({ _id, ownerUserId }: { _id?: ObjectId; ownerUserId?: ObjectId } = {}) => {
        if (!currentSite) {
          return Promise.resolve(null);
        }

        if (_id && !currentSite._id.equals(_id)) {
          return Promise.resolve(null);
        }

        if (ownerUserId && !currentSite.ownerUserId.equals(ownerUserId)) {
          return Promise.resolve(null);
        }

        return Promise.resolve(currentSite);
      }),
      insertOne: vi.fn().mockImplementation((newSite: SiteDocument) => {
        currentSite = newSite;
        insertSite(newSite);
        return Promise.resolve({ insertedId: newSite._id });
      }),
      find: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn().mockImplementation((filter: { _id: ObjectId; ownerUserId: ObjectId }) =>
        Promise.resolve({ deletedCount: deleteSite(filter) ? 1 : 0 })
      )
    },
    apiKeys: {
      find: vi.fn().mockImplementation(({ userId, siteId, projectId }: { userId?: ObjectId; siteId?: ObjectId; projectId?: string } = {}) => ({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(
            apiKeys.filter((apiKey) => {
              if (userId && !apiKey.userId.equals(userId)) {
                return false;
              }

              if (siteId && !apiKey.siteId?.equals(siteId)) {
                return false;
              }

              if (projectId !== undefined && apiKey.projectId !== projectId) {
                return false;
              }

              return true;
            })
          )
        })
      })),
      insertOne: vi.fn().mockImplementation((apiKey: { _id: ObjectId; keyHash: string; siteId?: ObjectId; userId: ObjectId; projectId?: string }) => {
        apiKeys.push(apiKey as ApiKeyDocument);
        insertApiKey(apiKey);
        return Promise.resolve({ insertedId: apiKey._id });
      }),
      findOne: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn().mockImplementation((filter: { userId: ObjectId; projectId?: string }, update: { $set?: Partial<ApiKeyDocument> }) => {
        updateApiKeys(filter, update);
        for (const apiKey of apiKeys) {
          if (!apiKey.userId.equals(filter.userId)) {
            continue;
          }

          if (filter.projectId !== undefined && apiKey.projectId !== filter.projectId) {
            continue;
          }

          Object.assign(apiKey, update.$set ?? {});
        }

        return Promise.resolve({ matchedCount: apiKeys.length, modifiedCount: apiKeys.length });
      }),
      deleteOne: vi.fn().mockImplementation((filter: { _id: ObjectId; siteId?: ObjectId; userId: ObjectId }) =>
        Promise.resolve({ deletedCount: deleteApiKey(filter) ? 1 : 0 })
      ),
      deleteMany: vi.fn().mockImplementation((filter: { siteId?: ObjectId; userId: ObjectId }) => {
        deleteSiteApiKeys(filter);
        return Promise.resolve({ deletedCount: 0 });
      })
    },
    atlasProjects: {
      find: vi.fn().mockImplementation(({ ownerUserId, siteId }: { ownerUserId: ObjectId; siteId: ObjectId }) => ({
        toArray: vi.fn().mockResolvedValue(
          currentAtlasProject &&
            currentAtlasProject.ownerUserId.equals(ownerUserId) &&
            currentAtlasProject.siteId?.equals(siteId)
            ? [currentAtlasProject]
            : []
        )
      })),
      findOne: vi.fn().mockImplementation(
        ({ ownerUserId, siteId, projectId }: { ownerUserId: ObjectId; siteId?: ObjectId; projectId?: string }) => {
          if (!currentAtlasProject || !currentAtlasProject.ownerUserId.equals(ownerUserId)) {
            return Promise.resolve(null);
          }

          if (projectId !== undefined) {
            return Promise.resolve(currentAtlasProject.projectId === projectId ? currentAtlasProject : null);
          }

          return Promise.resolve(
            siteId !== undefined && currentAtlasProject.siteId?.equals(siteId) ? currentAtlasProject : null
          );
        }
      ),
      insertOne: vi.fn().mockImplementation((project: AtlasProjectDocument) => {
        currentAtlasProject = project;
        insertAtlasProject(project);
        return Promise.resolve({ insertedId: project._id });
      }),
      updateOne: vi.fn().mockImplementation((_filter: unknown, update: { $set?: Partial<AtlasProjectDocument> }) => {
        if (currentAtlasProject && update.$set) {
          currentAtlasProject = {
            ...currentAtlasProject,
            ...update.$set
          };
        }

        return Promise.resolve({ matchedCount: currentAtlasProject ? 1 : 0, modifiedCount: currentAtlasProject ? 1 : 0 });
      }),
      deleteMany: vi.fn().mockImplementation((filter: { siteId?: ObjectId; ownerUserId: ObjectId }) => {
        deleteSiteAtlasProjects(filter);
        return Promise.resolve({ deletedCount: 0 });
      })
    },
    atlasDocuments: {
      findOne: vi.fn().mockImplementation(({ ownerUserId, projectId, type }: { ownerUserId: ObjectId; projectId: string; type: string }) =>
        Promise.resolve(
          atlasDocuments.find(
            (document) =>
              document.ownerUserId.equals(ownerUserId) &&
              document.projectId === projectId &&
              document.type === type
          ) ?? null
        )
      ),
      updateOne: vi.fn().mockImplementation((_filter: unknown, update: unknown) => {
        updateAtlasDocument(update);
        return Promise.resolve({ upsertedCount: 1, modifiedCount: 0 });
      }),
      deleteMany: vi.fn().mockImplementation((filter: { ownerUserId: ObjectId; projectId: { $in: string[] } }) => {
        deleteSiteAtlasDocuments(filter);
        return Promise.resolve({ deletedCount: 0 });
      })
    },
    interactionLogs: {
      deleteMany: vi.fn().mockImplementation((filter: { siteId: ObjectId }) => {
        deleteSiteInteractionLogs(filter);
        return Promise.resolve({ deletedCount: 0 });
      })
    }
  } as unknown as Collections;
}

function createUser(): UserDocument {
  return {
    _id: new ObjectId(),
    email: "dev@barkan.test",
    passwordHash: "unused",
    createdAt: new Date()
  } as UserDocument;
}

function createSite(ownerUserId: ObjectId): SiteDocument {
  return {
    _id: new ObjectId(),
    ownerUserId,
    name: "Test site",
    domain: "example.com",
    publicSiteKey: "site_test",
    createdAt: new Date(),
    updatedAt: new Date()
  } as SiteDocument;
}

function createAtlasProject(ownerUserId: ObjectId, siteId: ObjectId, projectId: string): AtlasProjectDocument {
  return {
    _id: new ObjectId(),
    ownerUserId,
    siteId,
    projectId,
    name: "Test Atlas project",
    createdAt: new Date(),
    updatedAt: new Date()
  } as AtlasProjectDocument;
}

function createPendingAtlasProject(ownerUserId: ObjectId, projectId: string): AtlasProjectDocument {
  return {
    _id: new ObjectId(),
    ownerUserId,
    projectId,
    name: "Pending site",
    pendingSiteDomain: "pending.example",
    createdAt: new Date(),
    updatedAt: new Date()
  } as AtlasProjectDocument;
}

function createBackendInventory(projectId: string) {
  return {
    version: 1,
    project_id: projectId,
    generated_at: "2026-05-18T10:00:00.000Z",
    source_files: ["apps/api/src/tasks.ts"],
    endpoints: [
      {
        method: "POST",
        path: "/api/tasks",
        summary: "Creates a task for the signed-in user.",
        auth: "requires user session cookie",
        request: {
          body: {
            title: { type: "string", required: true }
          }
        },
        response: {
          success: "201 with created task object",
          errors: ["400 invalid body", "401 unauthenticated"]
        }
      }
    ]
  };
}

function createAtlasDocument(
  ownerUserId: ObjectId,
  projectId: string,
  documentation: unknown
): AtlasDocumentDocument {
  return {
    _id: new ObjectId(),
    ownerUserId,
    projectId,
    type: "documentation",
    documentation,
    createdAt: new Date(),
    updatedAt: new Date()
  } as AtlasDocumentDocument;
}

function createAtlasDocumentationDocument(
  ownerUserId: ObjectId,
  projectId: string,
  frontend: unknown,
  backend: unknown | null = null
): AtlasDocumentDocument {
  return createAtlasDocument(ownerUserId, projectId, { frontend, backend });
}
