import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { AtlasRouteMapDocument } from "./atlas/route-map.js";
import type { AtlasBackendInventoryDocument } from "./atlas/backend-inventory.js";
import type { AtlasProjectDocument, Collections, SiteDocument } from "./db.js";

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

describe("widget routes", () => {
  it("returns widget config without runtime modes", async () => {
    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "GET",
      url: "/api/widget/config?siteKey=site_test",
      headers: {
        origin: "http://100.81.152.74:4889"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://100.81.152.74:4889");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(response.json().apiBaseUrl).toBe("http://localhost:4000");
    expect(response.json().site).toMatchObject({
      name: "Test App",
      publicSiteKey: "site_test",
      domain: "100.81.152.74:4889"
    });
    expect(JSON.stringify(response.json())).not.toContain("interactionEngine");

    await app.close();
  });

  it("allows realtime transcription tokens when the origin only has a domain warning", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ token: "sutkn_test" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(
      {
        ...baseConfig,
        ELEVENLABS_API_KEY: "elevenlabs"
      },
      createCollections({
        site: {
          ...createSite(),
          domain: "alumet.gay"
        }
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/transcribe-realtime-token",
      headers: {
        origin: "http://100.81.152.74:4001"
      },
      payload: {
        siteKey: "site_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: "sutkn_test",
      expiresInSeconds: 900
    });

    vi.unstubAllGlobals();
    await app.close();
  });

  it("rejects openai-stream requests without a DOM snapshot", async () => {
    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "where is billing?",
        screenshot: {
          imageBase64Data: "abc",
          width: 800,
          height: 600,
          mimeType: "image/jpeg"
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid request");

    await app.close();
  });

  it("returns unavailable action mode when backend documentation is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_test",
        userMessage: "Create a task",
        currentPage: {
          pathname: "/app/6a0e196b92e7a78cf9dfed1f",
          search: "?wall=main"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      type: "unavailable",
      message: "Action mode needs backend documentation before I can take actions here."
    });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    await app.close();
  });

  it("plans with the compact endpoint catalog and executes independent tasks in one batch", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Create two tasks",
            tasks: [
              { id: "task_one", label: "Create Task one", dependsOn: [], endpointHints: ["POST /api/tasks"] },
              { id: "task_two", label: "Create Task two", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          endpointDocKeys: ["POST /api/tasks"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCalls: [
            {
              callId: "task-one",
              taskId: "task_one",
              method: "POST",
              documentedPath: "/api/tasks",
              path: "/api/tasks",
              body: { title: "Task one", category: "chore" }
            },
            {
              callId: "task-two",
              taskId: "task_two",
              method: "POST",
              documentedPath: "/api/tasks",
              path: "/api/tasks",
              body: { title: "Task two", category: "chore" }
            }
          ]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({
        site: createSite(),
        backendInventory: createBackendInventory()
      })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "Create two tasks",
        currentPage: {
          pathname: "/app/board",
          search: "?wall=main"
        }
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "execute",
      progress: { label: "Running action" },
      httpCalls: [
        { callId: "task-one", taskId: "task_one", method: "POST", documentedPath: "/api/tasks", path: "/api/tasks" },
        { callId: "task-two", taskId: "task_two", method: "POST", documentedPath: "/api/tasks", path: "/api/tasks" }
      ],
      goalRunState: {
        loadedEndpointDocKeys: ["POST /api/tasks"],
        httpCallCount: 2,
        goalPlan: {
          tasks: [
            { id: "task_one", status: "running", dependsOn: [] },
            { id: "task_two", status: "running", dependsOn: [] }
          ]
        }
      }
    });

    const plannerBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
      max_output_tokens: number;
      tools: Array<{ type: string }>;
      tool_choice: string;
      text: { format: { type: string; name: string } };
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(plannerBody.model).toBe("gpt-5.4-2026-03-05");
    expect(plannerBody.max_output_tokens).toBe(12000);
    expect(plannerBody.tools).toEqual([{ type: "web_search" }]);
    expect(plannerBody.tool_choice).toBe("auto");
    expect(plannerBody.text.format).toMatchObject({
      type: "json_schema",
      name: "barkan_action_goal_planner"
    });
    const plannerInput = plannerBody.input[0]?.content[0]?.text ?? "";
    expect(plannerInput).toContain('"endpointCatalog"');
    expect(plannerInput).toContain('"path":"/api/tasks"');
    expect(plannerInput).toContain('"currentPage"');
    expect(plannerInput).not.toContain('"domSnapshot"');
    expect(plannerInput).not.toContain('"enum"');

    const builderBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      text: { format: { name: string } };
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(builderBody.text.format.name).toBe("barkan_action_http_builder");
    const builderInput = builderBody.input[0]?.content[0]?.text ?? "";
    expect(builderInput).toContain('"loadedEndpointDocs"');
    expect(builderInput).toContain('"enum":["bug","feature","chore"]');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("loads up to 20 initial precise endpoint docs in one planner batch", async () => {
    const endpointDocKeys = Array.from({ length: 25 }, (_, index) => "GET /api/generated-" + index);
    const backendInventory = createBackendInventory({ extraEndpointCount: 25 });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Load many docs",
            tasks: [
              { id: "load_many", label: "Load many docs", dependsOn: [], endpointHints: endpointDocKeys }
            ]
          },
          endpointDocKeys
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "ask_user",
          message: "Which item should I use?",
          taskIds: ["load_many"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "Load many docs"
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } }
    ]);
    expect(response.json()).toMatchObject({ type: "ask_user" });
    expect(response.json().goalRunState.loadedEndpointDocKeys).toEqual(endpointDocKeys.slice(0, 20));

    vi.unstubAllGlobals();
    await app.close();
  });

  it("loads initial precise docs from planner task endpoint hints", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Create a task",
            tasks: [
              { id: "create_task", label: "Create a task", dependsOn: [], endpointHints: ["post /api/tasks/"] }
            ]
          },
          endpointDocKeys: []
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-task",
            taskId: "create_task",
            method: "POST",
            documentedPath: "/api/tasks",
            path: "/api/tasks",
            body: { title: "Launch checklist", category: "feature" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "Create a task"
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "execute",
      goalRunState: {
        loadedEndpointDocKeys: ["POST /api/tasks"],
        httpCallCount: 1
      }
    });

    vi.unstubAllGlobals();
    await app.close();
  });

  it("keeps building when the builder selects docs already loaded by the planner", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Create a task",
            tasks: [
              { id: "create_task", label: "Create a task", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          endpointDocKeys: ["POST /api/tasks"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "select_endpoint_docs",
          endpointDocKeys: ["POST /api/tasks"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-task",
            taskId: "create_task",
            method: "POST",
            documentedPath: "/api/tasks",
            path: "/api/tasks",
            body: { title: "Launch checklist", category: "feature" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "Create a task"
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } },
      { type: "progress", progress: { label: "Searching documentation..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "execute",
      httpCall: { callId: "create-task", taskId: "create_task" },
      goalRunState: {
        loadedEndpointDocKeys: ["POST /api/tasks"],
        extraEndpointDocLoadCount: 0,
        httpCallCount: 1
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
    await app.close();
  });

  it("replans legacy client state and executes Alumet creation before its column", async () => {
    const userMessage = "create an Alumet called 'Testouille' and inside create one mock column";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: userMessage,
            tasks: [
              {
                id: "create_alumet",
                label: "Create the Alumet Testouille",
                dependsOn: [],
                endpointHints: ["POST /api/alumets"],
                progressLabel: "Creating Alumet"
              },
              {
                id: "create_column",
                label: "Create one mock column inside Testouille",
                dependsOn: ["create_alumet"],
                endpointHints: ["POST /api/alumets/:alumetId/columns"],
                progressLabel: "Creating column"
              }
            ]
          },
          endpointDocKeys: []
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-alumet",
            taskId: "create_alumet",
            method: "POST",
            documentedPath: "/api/alumets",
            path: "/api/alumets",
            body: { name: "Testouille" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-column",
            taskId: "create_column",
            method: "POST",
            documentedPath: "/api/alumets/:alumetId/columns",
            path: "/api/alumets/alumet_testouille/columns",
            body: { name: "Mock column" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response: alumetResponse, progressResponses: alumetProgress } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage,
        goalRunState: {
          version: 1,
          httpCallCount: 0,
          failedHttpCallCount: 0,
          loadedEndpointDocKeys: [],
          goalPlan: {
            version: 1,
            originalUserMessage: userMessage,
            completedTasks: [],
            pendingTasks: ["Create the Alumet Testouille", "Create one mock column inside Testouille"],
            blockedTasks: []
          }
        }
    });

    expect(alumetResponse.statusCode).toBe(200);
    expect(alumetProgress).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } }
    ]);
    expect(alumetResponse.json()).toMatchObject({
      type: "execute",
      progress: { label: "Creating Alumet" },
      httpCall: {
        callId: "create-alumet",
        taskId: "create_alumet",
        documentedPath: "/api/alumets",
        path: "/api/alumets",
        body: { name: "Testouille" }
      },
      goalRunState: {
        loadedEndpointDocKeys: ["POST /api/alumets", "POST /api/alumets/:alumetId/columns"],
        goalPlan: {
          tasks: [
            { id: "create_alumet", status: "running" },
            { id: "create_column", status: "pending", dependsOn: ["create_alumet"] }
          ]
        }
      }
    });

    const { response: columnResponse } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        goalRunState: alumetResponse.json().goalRunState,
        httpBatchResult: {
          ok: true,
          body: [
            {
              httpCall: alumetResponse.json().httpCall,
              result: { ok: true, status: 201, body: { id: "alumet_testouille", name: "Testouille" } }
            }
          ]
        }
    });

    expect(columnResponse.statusCode).toBe(200);
    expect(columnResponse.json()).toMatchObject({
      type: "execute",
      progress: { label: "Creating column" },
      httpCall: {
        callId: "create-column",
        taskId: "create_column",
        documentedPath: "/api/alumets/:alumetId/columns",
        path: "/api/alumets/alumet_testouille/columns",
        body: { name: "Mock column" }
      },
      goalRunState: {
        completedHttpCalls: [
          { httpCall: { taskId: "create_alumet" }, result: { ok: true } }
        ],
        goalPlan: {
          tasks: [
            { id: "create_alumet", status: "completed" },
            { id: "create_column", status: "running" }
          ]
        }
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
    await app.close();
  });

  it("materializes dependent child calls after parent results exist", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "create one column name Fhuit and create 3 mock posts inside",
            tasks: [
              { id: "create_column", label: "Create Fhuit column", dependsOn: [], endpointHints: ["POST /api/columns"], progressLabel: "Creating column" },
              {
                id: "create_posts",
                label: "Create 3 mock posts inside Fhuit",
                dependsOn: ["create_column"],
                endpointHints: ["POST /api/tasks"],
                forEachSuccessfulResultOf: "create_column",
                progressLabel: "Creating posts"
              }
            ]
          },
          endpointDocKeys: ["POST /api/columns"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-column",
            taskId: "create_column",
            method: "POST",
            documentedPath: "/api/columns",
            path: "/api/columns",
            body: { name: "Fhuit" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "select_endpoint_docs",
          endpointDocKeys: ["POST /api/tasks"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCalls: [1, 2, 3].map((index) => ({
            callId: "post-" + index,
            taskId: "create_posts",
            itemKey: "post-" + index,
            method: "POST",
            documentedPath: "/api/tasks",
            path: "/api/tasks",
            body: { title: "Mock post " + index, category: "chore", columnId: "col_fhuit" }
          }))
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response: parentResponse } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "create one column name Fhuit and create 3 mock posts inside"
    });
    expect(parentResponse.statusCode).toBe(200);
    expect(parentResponse.json()).toMatchObject({
      type: "execute",
      progress: { label: "Creating column" },
      httpCall: { callId: "create-column", taskId: "create_column" }
    });

    const { response: childResponse } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        goalRunState: parentResponse.json().goalRunState,
        httpBatchResult: {
          ok: true,
          body: [
            {
              httpCall: parentResponse.json().httpCall,
              result: { ok: true, status: 201, body: { id: "col_fhuit", name: "Fhuit" } }
            }
          ]
        }
    });

    expect(childResponse.statusCode).toBe(200);
    expect(childResponse.json()).toMatchObject({
      type: "execute",
      progress: { label: "Creating posts" },
      goalRunState: {
        loadedEndpointDocKeys: ["POST /api/columns", "POST /api/tasks"],
        extraEndpointDocLoadCount: 0,
        goalPlan: {
          tasks: [
            { id: "create_column", status: "completed" },
            { id: "create_posts", status: "running" }
          ]
        }
      }
    });
    expect(childResponse.json().httpCalls).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    vi.unstubAllGlobals();
    await app.close();
  });

  it("caps extra endpoint doc loading at five per goal", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "select_endpoint_docs",
          endpointDocKeys: ["GET /api/projects"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "final_explanation",
          message: "I could not load the remaining details needed to continue.",
          summaryTitle: "Could not load project details"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        goalRunState: {
          version: 1,
          goalPlan: {
            version: 1,
            originalUserMessage: "Find a project",
            tasks: [
              { id: "find_project", label: "Find a project", status: "ready", dependsOn: [], endpointHints: ["GET /api/projects"] }
            ]
          },
          loadedEndpointDocKeys: [],
          extraEndpointDocLoadCount: 5,
          httpCallCount: 0,
          failedHttpCallCount: 0,
          repairFailuresByHttpCall: {},
          completedHttpCalls: [],
          failedHttpCalls: []
        }
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Finishing up..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "final",
      message: "I could not load the remaining details needed to continue.",
      progress: { label: "Finishing up..." }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
    await app.close();
  });

  it("keeps successful bulk items, retries failed items, and leaves successful children unlocked", async () => {
    const failedHttpCall = {
      callId: "post-b",
      taskId: "create_posts",
      itemKey: "post-b",
      method: "POST",
      documentedPath: "/api/tasks",
      path: "/api/tasks",
      body: { title: "Post B", category: "chore", columnId: "col_fhuit" }
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIJsonText({
        type: "build_http_calls",
        httpCall: failedHttpCall
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_test",
        goalRunState: {
          version: 1,
          goalPlan: {
            version: 1,
            originalUserMessage: "Create two posts",
            tasks: [
              { id: "create_posts", label: "Create two posts", status: "running", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          loadedEndpointDocKeys: ["POST /api/tasks"],
          extraEndpointDocLoadCount: 0,
          httpCallCount: 2,
          failedHttpCallCount: 0,
          repairFailuresByHttpCall: {},
          completedHttpCalls: [],
          failedHttpCalls: []
        },
        httpBatchResult: {
          ok: false,
          body: [
            {
              httpCall: {
                callId: "post-a",
                taskId: "create_posts",
                itemKey: "post-a",
                method: "POST",
                documentedPath: "/api/tasks",
                path: "/api/tasks",
                body: { title: "Post A", category: "chore", columnId: "col_fhuit" }
              },
              result: { ok: true, status: 201, body: { id: "post_a" } }
            },
            {
              httpCall: failedHttpCall,
              result: { ok: false, status: 400, error: "Title already exists" }
            }
          ]
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      type: "execute",
      progress: { label: "Creating two posts" },
      httpCall: failedHttpCall,
      goalRunState: {
        goalPlan: { tasks: [{ id: "create_posts", status: "running" }] },
        completedHttpCalls: [{ httpCall: { itemKey: "post-a" } }],
        failedHttpCalls: [{ httpCall: { itemKey: "post-b" } }]
      }
    });
    const builderInput = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).input[0]?.content[0]?.text ?? "";
    expect(builderInput).toContain('"completedHttpCalls"');
    expect(builderInput).toContain('"failedHttpCalls"');
    expect(builderInput).toContain('"itemKey":"post-b"');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("caps retries for the same failed request even when the model changes call ids", async () => {
    const firstFailedCall = {
      callId: "attempt-1",
      taskId: "create_task",
      method: "POST",
      documentedPath: "/api/tasks",
      path: "/api/tasks",
      body: { title: "Launch checklist", category: "feature" }
    };
    const secondAttemptCall = {
      ...firstFailedCall,
      callId: "attempt-2"
    };
    const thirdAttemptCall = {
      ...firstFailedCall,
      callId: "attempt-3"
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: secondAttemptCall
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: thirdAttemptCall
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "final_explanation",
          message: "I could not create the task after retrying the failed request.",
          summaryTitle: "Could not create task"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const site = {
      ...createSite(),
      publicSiteKey: "site_retry_cap"
    } as SiteDocument;
    const app = await buildApp(
      baseConfig,
      createCollections({ site, backendInventory: createBackendInventory() })
    );
    const baseGoalRunState = {
      version: 1,
      goalPlan: {
        version: 1,
        originalUserMessage: "Create a task called Launch checklist",
        tasks: [
          { id: "create_task", label: "Create Launch checklist task", status: "running", dependsOn: [], endpointHints: ["POST /api/tasks"] }
        ]
      },
      loadedEndpointDocKeys: ["POST /api/tasks"],
      extraEndpointDocLoadCount: 0,
      httpCallCount: 1,
      failedHttpCallCount: 0,
      repairFailuresByHttpCall: {},
      completedHttpCalls: [],
      failedHttpCalls: []
    };

    const firstRetryResponse = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_retry_cap",
        goalRunState: baseGoalRunState,
        httpBatchResult: {
          ok: false,
          body: [
            {
              httpCall: firstFailedCall,
              result: { ok: false, status: 500, error: "server error" }
            }
          ]
        }
      }
    });
    expect(firstRetryResponse.statusCode).toBe(200);
    expect(firstRetryResponse.json()).toMatchObject({
      type: "execute",
      httpCall: { callId: "attempt-2" }
    });

    const secondRetryResponse = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_retry_cap",
        goalRunState: firstRetryResponse.json().goalRunState,
        httpBatchResult: {
          ok: false,
          body: [
            {
              httpCall: secondAttemptCall,
              result: { ok: false, status: 500, error: "server error" }
            }
          ]
        }
      }
    });
    expect(secondRetryResponse.statusCode).toBe(200);
    expect(secondRetryResponse.json()).toMatchObject({
      type: "execute",
      httpCall: { callId: "attempt-3" }
    });

    const { response: finalResponse, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_retry_cap",
        goalRunState: secondRetryResponse.json().goalRunState,
        httpBatchResult: {
          ok: false,
          body: [
            {
              httpCall: thirdAttemptCall,
              result: { ok: false, status: 500, error: "server error" }
            }
          ]
        }
    });
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Finishing up..." } }
    ]);
    expect(finalResponse.statusCode).toBe(200);
    expect(finalResponse.json()).toMatchObject({
      type: "final",
      message: "I could not create the task after retrying the failed request.",
      progress: { label: "Finishing up..." }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const finalGoalRunState = progressResponses[0] as { goalRunState: { failedHttpCalls: unknown[]; repairFailuresByHttpCall: Record<string, number> } };
    expect(finalGoalRunState.goalRunState.failedHttpCalls).toHaveLength(1);
    expect(Object.values(finalGoalRunState.goalRunState.repairFailuresByHttpCall)).toEqual([3]);

    vi.unstubAllGlobals();
    await app.close();
  });

  it("continues the same goal when the user selects an answer to a pending question", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIJsonText({
        type: "build_http_calls",
        httpCall: {
          callId: "task-answer",
          taskId: "create_task",
          method: "POST",
          documentedPath: "/api/tasks",
          path: "/api/tasks",
          body: { title: "Launch checklist", category: "feature" }
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_test",
        selectedChoice: {
          label: "1. Which category should I use?\nAnswer: feature",
          value: "feature"
        },
        goalRunState: {
          version: 1,
          goalPlan: {
            version: 1,
            originalUserMessage: "Create a task called Launch checklist",
            tasks: [
              { id: "create_task", label: "Create Launch checklist task", status: "ready", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          loadedEndpointDocKeys: ["POST /api/tasks"],
          extraEndpointDocLoadCount: 0,
          httpCallCount: 0,
          failedHttpCallCount: 0,
          repairFailuresByHttpCall: {},
          completedHttpCalls: [],
          failedHttpCalls: [],
          pendingQuestion: {
            message: "Which category should I use?",
            taskIds: ["create_task"]
          }
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ type: "execute", progress: { label: "Creating Launch checklist task" } });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      text: { format: { name: string } };
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(requestBody.text.format.name).toBe("barkan_action_http_builder");
    const builderInput = requestBody.input[0]?.content[0]?.text ?? "";
    expect(builderInput).toContain('"selectedChoice"');
    expect(builderInput).toContain('"answeredQuestion"');
    expect(builderInput).toContain('"message":"Which category should I use?"');
    expect(builderInput).toContain('"answeredQuestions"');
    expect(builderInput).toContain("Answer: feature");
    expect(builderInput).not.toContain('"pendingQuestion"');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("finalizes from reducer-owned completed state", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIJsonText({
        type: "final_explanation",
        message: "Done. I created the task.",
        summaryTitle: "Created 1 task"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );
    const httpCall = {
      callId: "task-final",
      taskId: "create_task",
      method: "POST",
      documentedPath: "/api/tasks",
      path: "/api/tasks",
      body: { title: "Launch checklist", category: "feature" }
    };

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        goalRunState: {
          version: 1,
          goalPlan: {
            version: 1,
            originalUserMessage: "Create a task called Launch checklist",
            tasks: [
              { id: "create_task", label: "Create Launch checklist task", status: "running", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          loadedEndpointDocKeys: ["POST /api/tasks"],
          extraEndpointDocLoadCount: 0,
          httpCallCount: 1,
          failedHttpCallCount: 0,
          repairFailuresByHttpCall: {},
          completedHttpCalls: [],
          failedHttpCalls: []
        },
        httpBatchResult: {
          ok: true,
          body: [
            { httpCall, result: { ok: true, status: 201, body: { id: "task_1" } } }
          ]
        }
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Finishing up..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "final",
      message: "Done. I created the task.",
      progress: { label: "Finishing up..." }
    });
    const finalizerBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      text: { format: { name: string } };
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(finalizerBody.text.format.name).toBe("barkan_action_finalizer");
    expect(finalizerBody.input[0]?.content[0]?.text).toContain('"status":"completed"');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("hides repaired failed calls from successful finalizer input", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIJsonText({
        type: "final_explanation",
        message: "Done. I created the post on the Kickoff wall.",
        summaryTitle: "Created post on Kickoff wall"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const site = {
      ...createSite(),
      publicSiteKey: "site_finalizer_sanitized"
    } as SiteDocument;
    const app = await buildApp(
      baseConfig,
      createCollections({ site, backendInventory: createBackendInventory() })
    );

    const progressResponse = await injectWidgetAction(app, {
        siteKey: "site_finalizer_sanitized",
        goalConversationContext: [
          { role: "user", text: "create a post" },
          { role: "tool", text: "POST /api/posts -> failed 404: request-routing error" }
        ],
        goalRunState: {
          version: 1,
          goalPlan: {
            version: 1,
            originalUserMessage: "create a post",
            tasks: [
              { id: "create_post", label: "Create New post on Kickoff wall", status: "completed", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          loadedEndpointDocKeys: ["POST /api/tasks"],
          extraEndpointDocLoadCount: 0,
          httpCallCount: 2,
          failedHttpCallCount: 1,
          repairFailuresByHttpCall: {
            "{\"body\":{\"wallId\":\"bad_wall\"},\"documentedPath\":\"/api/tasks\",\"itemKey\":\"\",\"method\":\"POST\",\"path\":\"/api/tasks\",\"query\":{},\"taskId\":\"create_post\"}": 1
          },
          completedHttpCalls: [
            {
              httpCall: {
                callId: "post-fixed",
                taskId: "create_post",
                method: "POST",
                documentedPath: "/api/tasks",
                path: "/api/tasks",
                body: { title: "New post", wallId: "kickoff_wall" }
              },
              result: { ok: true, status: 201, body: { id: "post_1", title: "New post", wallName: "Kickoff" } }
            }
          ],
          failedHttpCalls: [
            {
              httpCall: {
                callId: "post-bad",
                taskId: "create_post",
                method: "POST",
                documentedPath: "/api/tasks",
                path: "/api/tasks",
                body: { title: "New post", wallId: "bad_wall" }
              },
              result: { ok: false, status: 404, error: "request-routing error" }
            }
          ]
        }
    });
    expect(progressResponse.statusCode).toBe(200);
    expect(progressResponse.json()).toMatchObject({ type: "progress", progress: { label: "Finishing up..." } });

    const response = await injectWidgetAction(app, {
      siteKey: "site_finalizer_sanitized",
      goalRunState: progressResponse.json().goalRunState,
      goalConversationContext: [
        { role: "user", text: "create a post" },
        { role: "tool", text: "POST /api/posts -> failed 404: request-routing error" }
      ]
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      type: "final",
      message: "Done. I created the post on the Kickoff wall."
    });
    const finalizerInput = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).input[0]?.content[0]?.text ?? "";
    expect(finalizerInput).toContain('"status":"completed"');
    expect(finalizerInput).toContain('"title":"New post"');
    expect(finalizerInput).not.toContain("request-routing error");
    expect(finalizerInput).not.toContain("bad_wall");
    expect(finalizerInput).not.toContain("kickoff_wall");
    expect(finalizerInput).not.toContain('"status":201');
    expect(finalizerInput).not.toContain('"failedHttpCallCount":1');
    expect(finalizerInput).not.toContain('"repairFailuresByHttpCall"');
    expect(finalizerInput).not.toContain('"method":"POST"');
    expect(finalizerInput).not.toContain('"documentedPath"');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("rejects old action protocol field names", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const topLevelResponse = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_test",
        userMessage: "Create a task",
        actionState: { version: 1 }
      }
    });

    const resultItemResponse = await app.inject({
      method: "POST",
      url: "/api/widget/action",
      payload: {
        siteKey: "site_test",
        goalRunState: {
          version: 1,
          goalPlan: {
            version: 1,
            originalUserMessage: "Create a task",
            tasks: [
              { id: "create_task", label: "Create a task", status: "running", dependsOn: [], endpointHints: ["POST /api/tasks"] }
            ]
          },
          loadedEndpointDocKeys: ["POST /api/tasks"],
          extraEndpointDocLoadCount: 0,
          httpCallCount: 1,
          failedHttpCallCount: 0,
          repairFailuresByHttpCall: {},
          completedHttpCalls: [],
          failedHttpCalls: []
        },
        httpBatchResult: {
          ok: true,
          body: [
            {
              request: { method: "POST", path: "/api/tasks" },
              result: { ok: true, status: 201 }
            }
          ]
        }
      }
    });

    expect(topLevelResponse.statusCode).toBe(400);
    expect(resultItemResponse.statusCode).toBe(400);
    expect(topLevelResponse.json().error).toBe("invalid request");
    expect(resultItemResponse.json().error).toBe("invalid request");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    await app.close();
  });

  it("rejects action executes that are not backed by loaded documented endpoints", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Do admin thing",
            tasks: [
              { id: "admin_task", label: "Do admin thing", dependsOn: [], endpointHints: ["POST /api/admin"] }
            ]
          },
          endpointDocKeys: []
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "admin-call",
            taskId: "admin_task",
            method: "POST",
            documentedPath: "/api/admin",
            path: "/api/admin",
            body: { title: "x" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "final_explanation",
          message: "I could not safely perform that action.",
          summaryTitle: "Could not complete action"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "Do admin thing"
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } },
      { type: "progress", progress: { label: "Finishing up..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "final",
      message: "I could not safely perform that action.",
      progress: { label: "Finishing up..." }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const finalizerInput = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)).input[0]?.content[0]?.text ?? "";
    expect(finalizerInput).toContain('"status":"blocked"');
    expect(finalizerInput).toContain('"statusReason":"An HTTP call used an endpoint whose docs were not loaded."');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("blocks HTTP calls missing documented required body fields before browser execution", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Create a post",
            tasks: [
              { id: "create_post", label: "Create a post", dependsOn: [], endpointHints: ["POST /api/posts"] }
            ]
          },
          endpointDocKeys: ["POST /api/posts"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-post",
            taskId: "create_post",
            method: "POST",
            documentedPath: "/api/posts",
            path: "/api/posts",
            body: { title: "Mock post" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "final_explanation",
          message: "I could not create the post because a required value was missing before execution.",
          summaryTitle: "Could not create post"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: createSite(), backendInventory: createBackendInventory() })
    );

    const { response, progressResponses } = await injectUntilActionSettles(app, {
        siteKey: "site_test",
        userMessage: "Create a post"
    });

    expect(response.statusCode).toBe(200);
    expect(progressResponses).toMatchObject([
      { type: "progress", progress: { label: "Searching documentation..." } },
      { type: "progress", progress: { label: "Finishing up..." } }
    ]);
    expect(response.json()).toMatchObject({
      type: "final",
      message: "I could not create the post because a required value was missing before execution.",
      progress: { label: "Finishing up..." }
    });
    const builderBody = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(builderBody).toContain("required-field checklist");
    expect(builderBody).toContain("postColor");
    const finalizerInput = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)).input[0]?.content[0]?.text ?? "";
    expect(finalizerInput).toContain('"statusReason":"Missing required body value postColor."');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("blocks human labels used as documented id route params before browser execution", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "plan_goal",
          goalPlan: {
            originalUserMessage: "Create a column in Project Alpha",
            tasks: [
              { id: "create_column", label: "Create a column", dependsOn: [], endpointHints: ["POST /api/alumets/:alumetId/columns"] }
            ]
          },
          endpointDocKeys: ["POST /api/alumets/:alumetId/columns"]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "build_http_calls",
          httpCall: {
            callId: "create-column",
            taskId: "create_column",
            method: "POST",
            documentedPath: "/api/alumets/:alumetId/columns",
            path: "/api/alumets/Project Alpha/columns",
            body: { name: "New column" }
          }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(openAIJsonText({
          type: "final_explanation",
          message: "I could not create the column because the target was not resolved.",
          summaryTitle: "Could not create column"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const app = await buildApp(
      baseConfig,
      createCollections({ site: { ...createSite(), publicSiteKey: "site_reference_test" }, backendInventory: createBackendInventory() })
    );

    const { response } = await injectUntilActionSettles(app, {
        siteKey: "site_reference_test",
        userMessage: "Create a column in Project Alpha"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      type: "final",
      message: "I could not create the column because the target was not resolved."
    });
    const finalizerInput = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)).input[0]?.content[0]?.text ?? "";
    expect(finalizerInput).toContain('"statusReason":"A required route reference was not resolved to an id."');

    vi.unstubAllGlobals();
    await app.close();
  });

  it("includes the cleaned DOM snapshot in the OpenAI prompt", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[POINT:none] billing is under settings."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const routeMap = createRouteMap();
    const app = await buildApp(
      baseConfig,
      createCollections({
        site: createSite(),
        routeMap
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "where is billing?",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(requestBody).toContain("current route: /dashboard");
    expect(requestBody).toContain("cleaned DOM tree");
    expect(requestBody).toContain("c1");
    expect(requestBody).toContain("Centre d'aide");
    expect(requestBody).toContain("helpcenter.svg");
    expect(requestBody).not.toContain("/settings/billing");
    expect(requestBody).not.toContain("recommended click targets");
    expect(requestBody).not.toContain("screenshot");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("preserves independently captured UI facts through request validation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[POINTELEMENT:u_people:people][NEED_FURTHER_ACTION:true] open people first."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));
    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "invite members",
        domSnapshot: {
          ...createDomSnapshot(),
          route: "/settings/organization/general",
          uiFacts: [
            {
              id: "u_people",
              kind: "link",
              role: "link",
              label: "People",
              context: "Organization",
              href: "/settings/organization/people",
              metadata: {
                tagName: "a",
                container: {
                  kind: "section",
                  label: "Organization",
                  index: 1
                },
                classTokens: ["sidebar-item"]
              },
              state: {
                visible: true,
                disabled: false,
                selected: false,
                expanded: false,
                required: false
              },
              rect: { x: 24, y: 315, width: 120, height: 36 }
            }
          ],
          offscreenUiFacts: []
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    const promptText = (JSON.parse(requestBody) as {
      input: Array<{ content: Array<{ text: string }> }>;
    }).input[0]?.content[0]?.text ?? "";
    expect(requestBody).toContain("page action map");
    expect(requestBody).toContain("u_people");
    expect(requestBody).toContain("People");
    expect(requestBody).toContain("Organization");
    expect(promptText).toContain("\"kind\":\"section\"");
    expect(promptText).toContain("\"index\":1");
    expect(requestBody).toContain("visibleIndex");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("turns NAVIGATE directives into typed SSE navigate events", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[NAVIGATE:/settings/billing:billing] that's on billing. i'll take you there."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(
      baseConfig,
      createCollections({
        site: createSite(),
        routeMap: createRouteMap()
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "show billing",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"navigate\"");
    expect(response.body).toContain("\"route\":\"/settings/billing\"");
    expect(response.body).toContain("\"type\":\"assistant_text\"");
    expect(response.body).toContain("that's on billing. i'll take you there.");
    expect(response.body).not.toContain("[NAVIGATE:");
    expect(response.body).not.toContain("\"type\":\"action_plan\"");
    expect(response.body).not.toContain("\"type\":\"action_step\"");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("emits native OpenAI response ids and forwards the previous response id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamTextWithResponseId("resp_test_123", "[POINT:none][NEED_FURTHER_ACTION:false] yes."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "can you see the previous message?",
        previousResponseId: "resp_previous_123",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"openai_response\"");
    expect(response.body).toContain("\"responseId\":\"resp_test_123\"");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      previous_response_id?: string;
    };
    expect(requestBody.previous_response_id).toBe("resp_previous_123");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("does not forward native OpenAI conversation ids to DOM-scoped Responses calls", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[POINT:none][NEED_FURTHER_ACTION:false] yes."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "what was my first message?",
        conversationId: "conv_test_123",
        previousResponseId: "resp_previous_123",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      conversation?: string;
      previous_response_id?: string;
    };
    expect(requestBody.conversation).toBeUndefined();
    expect(requestBody.previous_response_id).toBe("resp_previous_123");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("emits ask_user tool calls as question events", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        openAIStreamAskUserToolCall({
          question: "What priority should I use?",
          options: [
            { label: "Low", value: "low", recommended: false },
            { label: "Medium", value: "medium", recommended: true },
            { label: "Critical", value: "critical", recommended: false }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "ask me a dummy question with mock data",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"question\"");
    expect(response.body).toContain("\"toolCallId\":\"call_test\"");
    expect(response.body).toContain("\"question\":\"What priority should I use?\"");
    expect(response.body).toContain("\"recommended\":true");
    expect(response.body).not.toContain("OpenAI returned no text chunks");

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      tools?: Array<{ type: string; name?: string }>;
      tool_choice?: string;
    };
    expect(requestBody.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "function", name: "ask_user" })])
    );
    expect(requestBody.tool_choice).toBe("auto");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("emits batched ask_user tool calls as one multi-question event", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        openAIStreamAskUserToolCall({
          questions: [
            {
              question: "What priority should I use?",
              options: [
                { label: "Low", value: "low", recommended: false },
                { label: "Medium", value: "medium", recommended: true }
              ]
            },
            {
              question: "What tone should I use?",
              options: [
                { label: "Short", value: "short", recommended: true },
                { label: "Detailed", value: "detailed", recommended: false }
              ]
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "ask me 2 dummy questions",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"question\"");
    expect(response.body).toContain("\"question\":\"What priority should I use?\"");
    expect(response.body).toContain("\"questions\":[");
    expect(response.body).toContain("\"question\":\"What tone should I use?\"");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("preserves multi-step metadata on scroll-to directives", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[SCROLLTO:c2:requested item][NEED_FURTHER_ACTION:true] open this item."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "show me the item",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"scroll\"");
    expect(response.body).toContain("\"elementId\":\"c2\"");
    expect(response.body).toContain("\"needFurtherAction\":true");
    expect(response.body).toContain("open this item.");
    expect(response.body).not.toContain("[SCROLLTO:");
    expect(response.body).not.toContain("[NEED_FURTHER_ACTION:");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("strips and emits typoed element point directives", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[poinelement:c20:nom de l'alumet] click the title field in settings."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "where then?",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"point\"");
    expect(response.body).toContain("\"elementId\":\"c20\"");
    expect(response.body).toContain("\"type\":\"assistant_text\"");
    expect(response.body).toContain("click the title field in settings.");
    expect(response.body).not.toContain("[poinelement:");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("emits needFurtherAction metadata for multi-step point directives", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[POINTELEMENT:c1:options][NEED_FURTHER_ACTION:true] open this item's options first."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "move this item",
        domSnapshot: createDomSnapshot(),
        guidanceContext: {
          originalPrompt: "move this item",
          step: 1,
          previousElementId: "c0"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"point\"");
    expect(response.body).toContain("\"elementId\":\"c1\"");
    expect(response.body).toContain("\"needFurtherAction\":true");
    expect(response.body).toContain("open this item's options first.");
    expect(response.body).not.toContain("[NEED_FURTHER_ACTION:");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("strips malformed need-further directive fragments from assistant text", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("[POINT:none][NEED_FURTHERi can't see any move control here."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "how can i move this?",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"assistant_text\"");
    expect(response.body).toContain("i can't see any move control here.");
    expect(response.body).not.toContain("[NEED");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("strips malformed inline point directive fragments from assistant text", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("if you mean settings, click [POINTELEMENT:c23:paramètres"), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "where do i edit first column settings?",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"point\"");
    expect(response.body).toContain("\"elementId\":\"c23\"");
    expect(response.body).toContain("\"type\":\"assistant_text\"");
    expect(response.body).toContain("if you mean settings, click");
    expect(response.body).not.toContain("[POINTELEMENT:");
    expect(response.body).not.toContain("c23:param");

    vi.unstubAllGlobals();
    await app.close();
  });

  it("strips malformed dangling point directive prefixes from assistant text", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(openAIStreamText("drag this first column and drop it to the right of [POINTELEMENT."), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(baseConfig, createCollections({ site: createSite() }));

    const response = await app.inject({
      method: "POST",
      url: "/api/widget/openai-stream",
      payload: {
        siteKey: "site_test",
        userPrompt: "how can i move the first column to the second position?",
        domSnapshot: createDomSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"assistant_text\"");
    expect(response.body).toContain("drag this first column and drop it to the right of");
    expect(response.body).not.toContain("[POINTELEMENT");

    vi.unstubAllGlobals();
    await app.close();
  });
});

function createCollections({
  site = null,
  routeMap = null,
  backendInventory = null
}: {
  site?: SiteDocument | null;
  routeMap?: AtlasRouteMapDocument | null;
  backendInventory?: AtlasBackendInventoryDocument | null;
} = {}): Collections {
  const projectId = routeMap?.project_id ?? backendInventory?.project_id ?? null;
  const atlasProject: AtlasProjectDocument | null = site && projectId
    ? {
        _id: new ObjectId(),
        ownerUserId: site.ownerUserId,
        siteId: site._id,
        projectId,
        name: "Test project",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    : null;

  return {
    sites: {
      findOne: vi.fn().mockResolvedValue(site)
    },
    atlasProjects: {
      findOne: vi.fn().mockResolvedValue(atlasProject)
    },
    atlasDocuments: {
      findOne: vi.fn().mockImplementation(({ type }: { type: string }) =>
        Promise.resolve((routeMap || backendInventory) && type === "documentation"
          ? {
              _id: new ObjectId(),
              ownerUserId: site?.ownerUserId ?? new ObjectId(),
              projectId,
              type: "documentation",
              documentation: {
                frontend: routeMap,
                backend: backendInventory
              },
              createdAt: new Date(),
              updatedAt: new Date()
            }
          : null)
      )
    },
    users: {},
    sessions: {},
    apiKeys: {},
    interactionLogs: {}
  } as unknown as Collections;
}

async function injectWidgetAction(app: FastifyInstance, payload: Record<string, unknown>) {
  return await app.inject({
    method: "POST",
    url: "/api/widget/action",
    payload
  });
}

async function injectUntilActionSettles(app: FastifyInstance, payload: Record<string, unknown>, maxTurns = 8) {
  const progressResponses: unknown[] = [];
  let response = await injectWidgetAction(app, payload);
  for (let turn = 0; turn < maxTurns; turn++) {
    const body = response.json() as { type?: string; goalRunState?: unknown };
    if (body.type !== "progress") {
      return { response, progressResponses };
    }
    progressResponses.push(body);
    response = await injectWidgetAction(app, {
      siteKey: "site_test",
      goalRunState: body.goalRunState
    });
  }
  return { response, progressResponses };
}

function createSite(): SiteDocument {
  return {
    _id: new ObjectId(),
    ownerUserId: new ObjectId(),
    name: "Test App",
    domain: "100.81.152.74:4889",
    publicSiteKey: "site_test",
    createdAt: new Date(),
    updatedAt: new Date()
  } as SiteDocument;
}

function createRouteMap(): AtlasRouteMapDocument {
  return {
    version: 1,
    project_id: "proj_test",
    generated_at: "2026-05-19T00:00:00.000Z",
    source_files: ["src/routes.tsx"],
    routes: [
      { path: "/", summary: "Home dashboard." },
      { path: "/settings/billing", summary: "Billing settings and invoices." }
    ]
  };
}

function createBackendInventory({ extraEndpointCount = 0 }: { extraEndpointCount?: number } = {}): AtlasBackendInventoryDocument {
  return {
    version: 1,
    project_id: "proj_test",
    generated_at: "2026-05-19T00:00:00.000Z",
    source_files: ["apps/api/src/tasks.ts"],
    endpoints: [
      {
        method: "POST",
        path: "/api/alumets",
        summary: "Creates an Alumet.",
        auth: "requires user session cookie",
        request: {
          body: {
            name: { type: "string", required: true }
          }
        },
        response: {
          success: "201 with created Alumet including its id",
          errors: ["400 invalid body", "401 unauthenticated"]
        }
      },
      {
        method: "POST",
        path: "/api/alumets/:alumetId/columns",
        summary: "Creates a column inside an Alumet.",
        auth: "requires user session cookie",
        request: {
          body: {
            name: { type: "string", required: true }
          }
        },
        response: {
          success: "201 with created column",
          errors: ["400 invalid body", "401 unauthenticated", "404 Alumet not found"]
        }
      },
      {
        method: "POST",
        path: "/api/columns",
        summary: "Creates a column.",
        auth: "requires user session cookie",
        request: {
          body: {
            name: { type: "string", required: true }
          }
        },
        response: {
          success: "201 with created column",
          errors: ["400 invalid body", "401 unauthenticated"]
        }
      },
      {
        method: "POST",
        path: "/api/posts",
        summary: "Creates a post.",
        auth: "requires user session cookie",
        request: {
          body: {
            title: { type: "string", required: true },
            postColor: { type: "string", required: true, allowedValues: ["red", "blue", "green"] }
          }
        },
        response: {
          success: "201 with created post",
          errors: ["400 invalid body", "401 unauthenticated"]
        }
      },
      {
        method: "POST",
        path: "/api/tasks",
        summary: "Creates a task.",
        auth: "requires user session cookie",
        request: {
          body: {
            category: { type: "string", required: true, enum: ["bug", "feature", "chore"] },
            title: { type: "string", required: true }
          }
        },
        response: {
          success: "201 with created task",
          errors: ["400 invalid body", "401 unauthenticated"]
        }
      },
      {
        method: "GET",
        path: "/api/projects",
        summary: "Lists projects.",
        auth: "requires user session cookie",
        request: {},
        response: {
          success: "200 with projects",
          errors: ["401 unauthenticated"]
        }
      }
    ].concat(
      Array.from({ length: extraEndpointCount }, (_, index) => ({
        method: "GET",
        path: `/api/generated-${index}`,
        summary: `Generated endpoint ${index}.`,
        auth: "requires user session cookie",
        request: {},
        response: {
          success: "200 with generated item",
          errors: ["401 unauthenticated"]
        }
      }))
    )
  };
}

function createDomSnapshot() {
  return {
    route: "/dashboard",
    viewportWidth: 1200,
    viewportHeight: 800,
    title: "Barkan dashboard",
    elements: [
      {
        id: "c1",
        tag: "button",
        label: "Centre d'aide",
        attributes: {
          id: "help"
        },
        rect: { x: 10, y: 10, width: 48, height: 48 },
        visibility: "visible",
        interactive: true,
        children: [
          {
            id: "c2",
            tag: "img",
            label: "Centre d'aide",
            attributes: {
              src: "/assets/global/helpcenter.svg",
              alt: "Centre d'aide"
            },
            rect: { x: 20, y: 20, width: 24, height: 24 },
            visibility: "visible",
            interactive: false
          }
        ]
      }
    ],
    scrollSurfaces: [],
    pageMeta: {
      title: "Barkan dashboard",
      route: "/dashboard",
      headings: ["Dashboard"],
      landmarks: ["main: Dashboard"],
      selectedNav: ["Dashboard"]
    }
  };
}

function openAIStreamText(text: string): string {
  return `data: ${JSON.stringify({
    type: "response.output_text.delta",
    delta: text
  })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}\n\n`;
}

function openAIStreamTextWithResponseId(responseId: string, text: string): string {
  return `data: ${JSON.stringify({
    type: "response.created",
    response: { id: responseId, status: "in_progress" }
  })}\n\ndata: ${JSON.stringify({
    type: "response.output_text.delta",
    delta: text
  })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { id: responseId, status: "completed" } })}\n\n`;
}

function openAIStreamAskUserToolCall(args: unknown): string {
  const argumentsJson = JSON.stringify(args);
  return `data: ${JSON.stringify({
    type: "response.output_item.added",
    output_index: 0,
    item: {
      type: "function_call",
      id: "fc_test",
      call_id: "call_test",
      name: "ask_user",
      arguments: ""
    }
  })}\n\ndata: ${JSON.stringify({
    type: "response.function_call_arguments.done",
    output_index: 0,
    item_id: "fc_test",
    name: "ask_user",
    arguments: argumentsJson
  })}\n\ndata: ${JSON.stringify({
    type: "response.output_item.done",
    output_index: 0,
    item: {
      type: "function_call",
      id: "fc_test",
      call_id: "call_test",
      name: "ask_user",
      arguments: argumentsJson
    }
  })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}\n\n`;
}

function openAIJsonText(value: unknown): string {
  return JSON.stringify({
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify(value)
          }
        ]
      }
    ]
  });
}
