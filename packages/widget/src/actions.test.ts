import { describe, expect, it, vi } from "vitest";
import {
  appendGoalConversationEntry,
  buildHttpBatchResultPayload,
  buildActionRequestHeaders,
  buildActionRequestUrl,
  buildActionRunSummary,
  createGoalRunStateForUserMessage,
  executeBrowserHttpCall,
  executeBrowserHttpCallBatch,
  buildResultHoldProgressLabel,
  formatActionProgressLabelForDisplay,
  inferActionMutationCounts,
  readHttpCallsFromActionResponse,
  summarizeHttpCallResult,
  type WidgetGoalConversationEntry
} from "./actions";

describe("action mode browser bridge", () => {
  it("creates an initial run state without a client-owned goal plan", () => {
    expect(createGoalRunStateForUserMessage("create one column name 'Fhuit' and create 3 mock posts inside")).toEqual({
      version: 1,
      httpCallCount: 0,
      failedHttpCallCount: 0,
      loadedEndpointDocKeys: []
    });
  });

  it("keeps only execution context while holding result progress", () => {
    expect(buildResultHoldProgressLabel("Creating posts")).toBe("Creating posts...");
    expect(buildResultHoldProgressLabel("Creating posts...")).toBe("Creating posts...");
    expect(buildResultHoldProgressLabel("Finishing up...")).toBe("Running action...");
  });

  it("adds display ellipses to progress labels without storing them in dynamic labels", () => {
    expect(formatActionProgressLabelForDisplay("Creating posts")).toBe("Creating posts...");
    expect(formatActionProgressLabelForDisplay("Creating posts...")).toBe("Creating posts...");
  });

  it("infers positive action summary counts from successful create and update calls", () => {
    expect(
      inferActionMutationCounts({
        completedHttpCalls: [
          {
            httpCall: { method: "POST", documentedPath: "/api/tasks", path: "/api/tasks" },
            result: { ok: true }
          },
          {
            httpCall: { method: "PATCH", documentedPath: "/api/tasks/:id", path: "/api/tasks/1" },
            result: { ok: true }
          },
          {
            httpCall: { method: "PUT", documentedPath: "/api/tasks/:id", path: "/api/tasks/2" },
            result: { ok: true }
          }
        ]
      })
    ).toEqual({ positiveCount: 3, negativeCount: 0 });
  });

  it("infers negative action summary counts from successful delete calls", () => {
    expect(
      inferActionMutationCounts({
        completedHttpCalls: [
          {
            httpCall: { method: "DELETE", documentedPath: "/api/tasks/:id", path: "/api/tasks/1" },
            result: { ok: true }
          }
        ]
      })
    ).toEqual({ positiveCount: 0, negativeCount: 1 });
  });

  it("does not count failed or read-only action summary calls", () => {
    expect(
      inferActionMutationCounts({
        completedHttpCalls: [
          {
            httpCall: { method: "POST", documentedPath: "/api/tasks", path: "/api/tasks" },
            result: { ok: false }
          },
          {
            httpCall: { method: "GET", documentedPath: "/api/tasks", path: "/api/tasks" },
            result: { ok: true }
          }
        ]
      })
    ).toEqual({ positiveCount: 0, negativeCount: 0 });
  });

  it("returns zero action summary counts when no completed calls exist", () => {
    expect(inferActionMutationCounts({ completedHttpCalls: [] })).toEqual({ positiveCount: 0, negativeCount: 0 });
  });

  it("builds an action summary title and issue flag from the run state", () => {
    expect(
      buildActionRunSummary(
        {
          failedHttpCallCount: 1,
          completedHttpCalls: [
            {
              httpCall: { method: "PATCH", documentedPath: "/api/tasks/:id", path: "/api/tasks/1" },
              result: { ok: true }
            }
          ],
          goalPlan: {
            tasks: [{ label: "Update task", status: "partial" }]
          }
        },
        "Done. Updated task title.",
        "Edited task title"
      )
    ).toEqual({
      title: "Edited task title",
      positiveCount: 1,
      negativeCount: 0,
      hasIssues: true
    });
  });

  it("cleans bullet-style first-person action summary titles", () => {
    expect(buildActionRunSummary({}, "Done.", "- I created one column and added 3 posts").title).toBe(
      "Created one column and added 3 posts"
    );
  });

  it("falls back to a compact mutation title when the finalizer omits one", () => {
    expect(
      buildActionRunSummary(
        {
          completedHttpCalls: [
            {
              httpCall: { method: "PATCH", documentedPath: "/api/columns/:id", path: "/api/columns/1" },
              result: { ok: true }
            },
            {
              httpCall: { method: "POST", documentedPath: "/api/cards", path: "/api/cards" },
              result: { ok: true }
            },
            {
              httpCall: { method: "POST", documentedPath: "/api/cards", path: "/api/cards" },
              result: { ok: true }
            }
          ]
        },
        "Done. The column was renamed and two cards were added."
      ).title
    ).toBe("Edited 1 column, 2 cards");
  });

  it("builds same-origin action URLs with query params", () => {
    expect(
      buildActionRequestUrl("/api/tasks", { projectId: "proj_1", tags: ["a", "b"] }, "https://app.example.com")
    ).toBe("https://app.example.com/api/tasks?projectId=proj_1&tags=a&tags=b");
  });

  it("rejects unsafe action URLs", () => {
    expect(() => buildActionRequestUrl("https://evil.example/api", undefined, "https://app.example.com")).toThrow(
      "not allowed"
    );
    expect(() => buildActionRequestUrl("//evil.example/api", undefined, "https://app.example.com")).toThrow(
      "not allowed"
    );
  });

  it("adds JSON and common csrf headers", () => {
    const doc = {
      cookie: "XSRF-TOKEN=cookie-token",
      querySelector: vi.fn(() => ({ content: "meta-token" }))
    } as unknown as Document;

    expect(buildActionRequestHeaders(true, doc)).toEqual({
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": "meta-token",
      "x-xsrf-token": "meta-token"
    });
  });

  it("executes HTTP calls with credentials and returns the full parsed response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "task_1", title: "Ship it" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );
    const doc = {
      cookie: "",
      querySelector: vi.fn(() => null)
    } as unknown as Document;

    await expect(
      executeBrowserHttpCall(
        {
          method: "POST",
          documentedPath: "/api/tasks",
          path: "/api/tasks",
          body: { title: "Ship it" }
        },
        fetchMock,
        "https://app.example.com",
        doc
      )
    ).resolves.toEqual({
      ok: true,
      status: 201,
      contentType: "application/json",
      body: { id: "task_1", title: "Ship it" }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.com/api/tasks",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ title: "Ship it" })
      })
    );
  });

  it("reads parallel HTTP calls from action responses", () => {
    const httpCalls = [
      {
        method: "POST",
        documentedPath: "/api/tasks",
        path: "/api/tasks",
        body: { title: "Task one" }
      },
      {
        method: "POST",
        documentedPath: "/api/tasks",
        path: "/api/tasks",
        body: { title: "Task two" }
      }
    ];

    expect(readHttpCallsFromActionResponse({ type: "execute", goalRunState: {}, httpCalls })).toEqual(httpCalls);
  });

  it("returns executed HTTP call context with browser results", () => {
    expect(
      buildHttpBatchResultPayload([
        {
          httpCall: {
            method: "POST",
            documentedPath: "/api/columns",
            path: "/api/columns",
            body: { name: "Fhuit" }
          },
          result: {
            ok: true,
            status: 201,
            contentType: "application/json",
            body: { id: "col_1", name: "Fhuit" }
          }
        }
      ])
    ).toEqual({
      ok: true,
      status: 201,
      contentType: "application/json",
      body: [
        {
          httpCall: {
            method: "POST",
            documentedPath: "/api/columns",
            path: "/api/columns",
            body: { name: "Fhuit" }
          },
          result: {
            ok: true,
            status: 201,
            contentType: "application/json",
            body: { id: "col_1", name: "Fhuit" }
          }
        }
      ]
    });
  });

  it("executes multiple browser HTTP calls in parallel", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(
                  new Response(JSON.stringify({ id: "task_1" }), {
                    status: 201,
                    headers: { "content-type": "application/json" }
                  })
                ),
              5
            );
          })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task_2" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      );
    const doc = {
      cookie: "",
      querySelector: vi.fn(() => null)
    } as unknown as Document;

    const result = await executeBrowserHttpCallBatch(
      [
        {
          method: "POST",
          documentedPath: "/api/tasks",
          path: "/api/tasks",
          body: { title: "Task one" }
        },
        {
          method: "POST",
          documentedPath: "/api/tasks",
          path: "/api/tasks",
          body: { title: "Task two" }
        }
      ],
      fetchMock,
      "https://app.example.com",
      doc
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://app.example.com/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Task two" })
      })
    );
    expect(result.map(({ result: item }) => item.body)).toEqual([{ id: "task_1" }, { id: "task_2" }]);
  });

  it("keeps compact action conversation context bounded and redacted", () => {
    const entries = Array.from({ length: 31 }, (_, index) => ({
      role: "user" as const,
      text: `message ${index} token=secret_${index}_abcdefghijklmnop`
    })).reduce<WidgetGoalConversationEntry[]>(
      (context, entry) => appendGoalConversationEntry(context, entry),
      []
    );

    expect(entries).toHaveLength(30);
    expect(entries[0]?.text).toContain("message 1");
    expect(entries.at(-1)?.text).toBe("message 30 token: [redacted]");
  });

  it("summarizes HTTP call results without full secret values", () => {
    expect(
      summarizeHttpCallResult(
        {
          method: "POST",
          documentedPath: "/api/tasks",
          path: "/api/tasks"
        },
        {
          ok: false,
          status: 401,
          body: {
            error: "unauthorized",
            apiKey: "sk-secret-key-value"
          }
        }
      )
    ).toBe('POST /api/tasks -> failed 401: {"error":"unauthorized","apiKey":"[redacted]"}');
  });
});
