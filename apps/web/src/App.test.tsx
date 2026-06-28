import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const testUser = {
  id: "user_1",
  email: "maxence@example.com",
  displayName: null,
  phoneNumber: null,
  avatarUrl: null,
  notificationPreferences: {
    productEmails: true,
    documentationEmails: true,
    securityEmails: true
  },
  createdAt: "2026-01-01T00:00:00.000Z"
};

const testSite = {
  id: "site_1",
  name: "Test site",
  domain: "example.com",
  publicSiteKey: "site_public_key_123456",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z"
};

beforeEach(() => {
  window.history.pushState({}, "", "/dashboard");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
  localStorage.clear();
});

describe("App", () => {
  it("shows the landing page on the root route without bootstrapping the dashboard", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(screen.getByLabelText("Loading Barkan homepage")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the pricing page without bootstrapping the dashboard", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/plans");

    render(<App />);

    expect(screen.getByRole("heading", { name: /Pricing that scales\s+with your company\./ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Growth" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enterprise" })).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Founder-friendly answers." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Get started" })).toHaveLength(3);
    screen.getAllByRole("link", { name: "Get started" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/signin");
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects dashboard visitors without a session to signin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no" }), { status: 401 }))
    );

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/signin");
    });
    expect(await screen.findByRole("heading", { name: "Welcome !" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("shows the auth screen on the signin route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no" }), { status: 401 }))
    );
    window.history.pushState({}, "", "/signin");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Welcome !" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows an inline field error instead of submitting an empty auth email", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({ error: "no" }), { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/signin");

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please fill in this field.");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/auth/check-email"))).toBe(false);
  });

  it("shows the backend email validation message when email lookup is rejected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ error: "no" }), { status: 401 });
      }

      if (url.endsWith("/api/auth/check-email") && method === "POST") {
        return new Response(
          JSON.stringify({
            error: "invalid request",
            details: {
              fieldErrors: { email: ["Invalid email"] },
              formErrors: []
            }
          }),
          { status: 400 }
        );
      }

      throw new Error("Fallback should not run after a validation response");
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/signin");

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "test@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/auth/check-email"))).toHaveLength(1);
  });

  it("does not show non-json error response bodies in auth field errors", async () => {
    const htmlError = "<html><head><title>405 Not Allowed</title></head><body>nginx</body></html>";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ message: "no" }), { status: 401 });
      }

      if (url.endsWith("/api/auth/check-email") && method === "POST") {
        return new Response(htmlError, { status: 405, statusText: "Not Allowed" });
      }

      throw new Error("Fallback should not run after a failed validation response");
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/signin");

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "test@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("405 Not Allowed");
    expect(screen.getByRole("alert")).not.toHaveTextContent("<html>");
  });

  it("moves from signin to the dashboard after login", async () => {
    const fetchMock = stubSigninFetch();
    window.history.pushState({}, "", "/signin");

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "maxence@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Enter password" })).toBeInTheDocument();
    const passwordPanel = await findActiveAuthPanel("password");
    fireEvent.change(within(passwordPanel).getByLabelText("Password"), {
      target: { value: "password123" }
    });
    fireEvent.click(within(passwordPanel).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Agent identities" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("moves from signin to the dashboard after signup when the email is new", async () => {
    const fetchMock = stubSignupFetch();
    window.history.pushState({}, "", "/signin");

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "new@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Choose password" })).toBeInTheDocument();
    const passwordPanel = await findActiveAuthPanel("password");
    fireEvent.change(within(passwordPanel).getByLabelText("Password"), {
      target: { value: "password123" }
    });
    fireEvent.click(within(passwordPanel).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Agent identities" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/signup$/),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("moves back to the landing page after sign out", async () => {
    const fetchMock = stubDashboardFetch(null);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Agent identities" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(screen.getByLabelText("Loading Barkan homepage")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/logout$/),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows general settings by default and renders the phone tab", async () => {
    stubDashboardFetch(null);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Test site/ }));

    expect(`${window.location.pathname}${window.location.search}`).toBe("/dashboard/site/site_1?tab=credentials");
    expect(await screen.findByRole("tab", { name: "Credentials", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Phone" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Runtime mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Interaction mode" })).not.toBeInTheDocument();
  });

  it("opens a site detail phone route directly", async () => {
    stubDashboardFetch(null);
    window.history.pushState({}, "", "/dashboard/site/site_1?tab=phone");

    render(<App />);

    expect(await screen.findByRole("tab", { name: "Phone", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Phone" })).toBeInTheDocument();
    expect(screen.getByText("+1 (415) 555-0198")).toBeInTheDocument();
    expect(screen.getByText("mock ElevenLabs · active")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calling capability" })).toBeInTheDocument();
    expect(screen.getByText("handled through Chat")).toBeInTheDocument();
    expect(screen.getByText("No call history yet.")).toBeInTheDocument();
  });

  it("defaults a site detail route without a tab to credentials", async () => {
    stubDashboardFetch(null);
    window.history.pushState({}, "", "/dashboard/site/site_1");

    render(<App />);

    expect(await screen.findByRole("tab", { name: "Credentials", selected: true })).toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/dashboard/site/site_1");
  });

  it("falls back to general settings for unknown or old site detail tabs", async () => {
    stubDashboardFetch(null);
    window.history.pushState({}, "", "/dashboard/site/site_1?tab=documentation");

    render(<App />);

    expect(await screen.findByRole("tab", { name: "Credentials", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Documentation" })).not.toBeInTheDocument();
  });

  it("renders payments and email tabs from site details", async () => {
    stubDashboardFetch(null);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Test site/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "Payments" }));

    expect(await screen.findByRole("tab", { name: "Payments", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Email" }));

    expect(await screen.findByRole("tab", { name: "Email", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Email" })).toBeInTheDocument();
  });

  it("only shows the raw API-key copy action for a newly created key", async () => {
    stubDashboardFetch(null);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Test site/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "OpenClaw" }));
    expect(await screen.findByRole("heading", { name: "OpenClaw linking tokens" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy token" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create link token" }));

    expect(await screen.findByRole("button", { name: "Copy token" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ck_created_secret")).not.toBeInTheDocument();
  });

  it("creates a setup, shows the OpenClaw link prompt, and then shows the identity receipt", async () => {
    const generatedDocumentation = createRouteDocumentation("proj_new");
    const fetchMock = stubOnboardingFetch(generatedDocumentation);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });

    render(<App />);

    fireEvent.click((await screen.findAllByRole("button", { name: "New identity" }))[0]);
    expect(window.location.pathname).toBe("/new-site");
    fireEvent.change(await screen.findByLabelText("Identity name"), {
      target: { value: "New site" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Connect OpenClaw" }, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("OpenClaw endpoint"), {
      target: { value: "new.example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create link prompt" }));

    expect(await screen.findByText("link token: ck_••••••••")).toBeInTheDocument();
    expect(screen.queryByText("ck_onboarding_secret")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/site-setups$/),
      expect.objectContaining({ method: "POST" })
    );
    expect(
      fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/api/sites") && init?.method === "POST")
    ).toBe(false);
    expect(await screen.findByRole("heading", { name: "Link existing OpenClaw" })).toBeInTheDocument();
    expect(screen.getByText("OpenClaw link")).toBeInTheDocument();
    expect(screen.getByText("Waiting for OpenClaw skill confirmation")).toBeInTheDocument();
    expect(screen.getByText(/Send this prompt to your OpenClaw instance/)).toBeInTheDocument();
    expect(screen.getByText(/Project token: proj_new/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ck_onboarding_secret");
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Confirmation token: ck_onboarding_secret"));
    fireEvent.click(screen.getByRole("button", { name: "Demo: mark linked" }));
    expect(await screen.findByRole("heading", { name: "Identity ready" }, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByText(/phone=\+1-415-555-0198/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy receipt" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("openclaw=new.example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "You're all set" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to dashboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(await screen.findByRole("heading", { name: "Agent identities" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New site/ })).toBeInTheDocument();
    expect(screen.getAllByText("OpenClaw linked").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/site-setups\/proj_new\/complete$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skipDocumentation: true })
      })
    );
  });

  it("can skip the codebase connection during site creation", async () => {
    const generatedDocumentation = createRouteDocumentation("proj_new");
    const fetchMock = stubOnboardingFetch(generatedDocumentation, {
      documentationAgent: {
        projectId: "proj_new",
        connected: false,
        connectedAt: null
      }
    });

    render(<App />);

    fireEvent.click((await screen.findAllByRole("button", { name: "New identity" }))[0]);
    fireEvent.change(await screen.findByLabelText("Identity name"), {
      target: { value: "New site" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Connect OpenClaw" }, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("OpenClaw endpoint"), {
      target: { value: "new.example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create link prompt" }));

    expect(await screen.findByRole("heading", { name: "Link existing OpenClaw" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Demo: mark linked" }));

    expect(await screen.findByRole("heading", { name: "Identity ready" })).toBeInTheDocument();
    expect(screen.getByText(/phone=\+1-415-555-0198/)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) =>
        String(input).endsWith("/api/site-setups/proj_new/documentation/generate") && init?.method === "POST"
      )
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/site-setups\/proj_new\/complete$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skipDocumentation: true })
      })
    );
  });

  it("deletes a selected site from the site details", async () => {
    const fetchMock = stubDashboardFetch(null);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Test site/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete identity" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Test site/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/sites\/site_1$/),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

async function findActiveAuthPanel(inputName: string): Promise<HTMLElement> {
  let activeInput: HTMLInputElement | null = null;

  await waitFor(() => {
    activeInput = document.querySelector(`.auth-card__panel--active input[name="${inputName}"]`);
    expect(activeInput).not.toBeNull();
  });

  return activeInput!.closest(".auth-card__panel") as HTMLElement;
}

function createRouteDocumentation(projectId: string) {
  return {
    version: 1,
    project_id: projectId,
    generated_at: "2026-05-17T10:00:00.000Z",
    source_files: ["src/App.tsx"],
    routes: [
      {
        path: "/",
        summary: "Home page with sign in and sign up entry points."
      },
      {
        path: "/dashboard",
        summary: "Dashboard for managing sites, snippets, API keys, and documentation."
      }
    ]
  };
}

function createBackendDocumentation(projectId: string) {
  return {
    version: 1,
    project_id: projectId,
    generated_at: "2026-05-17T10:00:00.000Z",
    source_files: ["apps/api/src/tasks.ts"],
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
  };
}

function createDocumentationAgent() {
  return {
    projectId: "proj_site",
    connected: true,
    connectedAt: "2026-05-17T09:00:00.000Z"
  };
}

function stubSigninFetch() {
  let isLoggedIn = false;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/auth/me")) {
      if (!isLoggedIn) {
        return new Response(JSON.stringify({ error: "no" }), { status: 401 });
      }

      return new Response(JSON.stringify({ user: testUser }));
    }

    if (url.endsWith("/api/auth/check-email") && method === "POST") {
      return new Response(JSON.stringify({ exists: true }));
    }

    if (url.endsWith("/api/auth/login") && method === "POST") {
      isLoggedIn = true;
      return new Response(JSON.stringify({ user: testUser }));
    }

    if (url.endsWith("/api/sites") && method === "GET") {
      return new Response(JSON.stringify({ sites: [testSite] }));
    }

    return new Response(JSON.stringify({ error: "unexpected" }), { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubSignupFetch() {
  let isLoggedIn = false;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/auth/me")) {
      if (!isLoggedIn) {
        return new Response(JSON.stringify({ error: "no" }), { status: 401 });
      }

      return new Response(JSON.stringify({ user: testUser }));
    }

    if (url.endsWith("/api/auth/check-email") && method === "POST") {
      return new Response(JSON.stringify({ exists: false }));
    }

    if (url.endsWith("/api/auth/signup") && method === "POST") {
      isLoggedIn = true;
      return new Response(JSON.stringify({ user: testUser }));
    }

    if (url.endsWith("/api/sites") && method === "GET") {
      return new Response(JSON.stringify({ sites: [testSite] }));
    }

    return new Response(JSON.stringify({ error: "unexpected" }), { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubDashboardFetch(
  documentation: unknown | null,
  documentationAgent: unknown | null = null,
  generatedDocumentation: unknown | null = null,
  backendDocumentation: unknown | null = null,
  generatedBackendDocumentation: unknown | null = null,
  documentationGeneration: unknown | null = null
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/auth/me")) {
      return new Response(JSON.stringify({ user: testUser }));
    }

    if (url.endsWith("/api/sites") && method === "GET") {
      return new Response(JSON.stringify({ sites: [testSite] }));
    }

    if (url.endsWith("/api/sites/site_1") && method === "GET") {
      return new Response(
        JSON.stringify({
          site: testSite,
          snippet: '<script async src="http://localhost:4000/widget.js" data-barkan-site="site_public_key_123456"></script>',
          apiKeys: [
            {
              id: "key_1",
              name: "CLI key",
              prefix: "ck_abcd123",
              createdAt: "2026-05-17T10:00:00.000Z",
              lastUsedAt: null
            }
          ],
          documentation,
          backendDocumentation,
          sourceContext: null,
          documentationAgent,
          documentationGeneration
        })
      );
    }

    if (url.endsWith("/api/sites/site_1/documentation-agent") && method === "GET") {
      return new Response(JSON.stringify({ documentationAgent }));
    }

    if (url.endsWith("/api/sites/site_1/documentation/generate") && method === "POST" && generatedDocumentation) {
      return new Response(createDocumentationGenerationStream(generatedDocumentation, generatedBackendDocumentation), {
        headers: { "content-type": "text/event-stream" }
      });
    }

    if (url.endsWith("/api/sites/site_1/payment-activity") && method === "GET") {
      return new Response(
        JSON.stringify({
          account_id: "site_1",
          payment_identity: {
            payment_identity_id: "pay_site_1",
            provider: "mock-stripe",
            card_last4: "4242",
            status: "active",
            created_at: "2026-05-17T10:00:00.000Z"
          },
          policy: null,
          purchase_requests: [],
          transactions: []
        })
      );
    }

    if (url.endsWith("/api/sites/site_1/email-activity") && method === "GET") {
      return new Response(
        JSON.stringify({
          account_id: "site_1",
          email_identity: {
            email_identity_id: "email_site_1",
            email_address: "agent@identity.barkan.dev",
            display_name: "Test site",
            provider: "mock-resend",
            status: "active",
            created_at: "2026-05-17T10:00:00.000Z"
          },
          messages: [],
          reply_notifications: []
        })
      );
    }

    if (url.endsWith("/api/sites/site_1/api-keys") && method === "POST") {
      return new Response(
        JSON.stringify({
          apiKey: {
            id: "key_2",
            name: "CLI key",
            prefix: "ck_created",
            createdAt: "2026-05-17T10:05:00.000Z",
            lastUsedAt: null
          },
          secret: "ck_created_secret"
        })
      );
    }

    if (url.endsWith("/api/sites/site_1") && method === "DELETE") {
      return new Response(JSON.stringify({ ok: true }));
    }

    return new Response(JSON.stringify({ error: "unexpected" }), { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubOnboardingFetch(
  generatedDocumentation: unknown,
  options: { documentationAgent?: unknown; streamDelayMs?: number } = {}
) {
  const generatedBackendDocumentation = createBackendDocumentation("proj_new");
  const documentationAgent = options.documentationAgent ?? createDocumentationAgent();
  const streamDelayMs = options.streamDelayMs ?? 80;
  const newSite = {
    id: "site_new",
    name: "New site",
    domain: "new.example.com",
    publicSiteKey: "site_new_key",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z"
  };
  let didGenerateDocumentation = false;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/auth/me")) {
      return new Response(JSON.stringify({ user: testUser }));
    }

    if (url.endsWith("/api/sites") && method === "GET") {
      return new Response(JSON.stringify({ sites: didGenerateDocumentation ? [newSite, testSite] : [testSite] }));
    }

    if (url.endsWith("/api/site-setups") && method === "POST") {
      return new Response(
        JSON.stringify({
          setup: {
            projectId: "proj_new",
            name: "New site",
            domain: "new.example.com",
            createdAt: "2026-05-18T00:00:00.000Z",
            updatedAt: "2026-05-18T00:00:00.000Z"
          },
          apiKey: {
            id: "key_new",
            name: "CLI key",
            prefix: "ck_onboard",
            createdAt: "2026-05-18T00:01:00.000Z",
            lastUsedAt: null
          },
          secret: "ck_onboarding_secret"
        }),
        { status: 201 }
      );
    }

    if (url.endsWith("/api/site-setups/proj_new") && method === "GET") {
      return new Response(
        JSON.stringify({
          setup: {
            projectId: "proj_new",
            name: "New site",
            domain: "new.example.com",
            createdAt: "2026-05-18T00:00:00.000Z",
            updatedAt: "2026-05-18T00:00:00.000Z"
          },
          apiKeys: [
            {
              id: "key_new",
              name: "CLI key",
              prefix: "ck_onboard",
              createdAt: "2026-05-18T00:01:00.000Z",
              lastUsedAt: null
            }
          ],
          documentation: didGenerateDocumentation ? generatedDocumentation : null,
          backendDocumentation: didGenerateDocumentation ? generatedBackendDocumentation : null,
          documentationAgent
        })
      );
    }

    if (url.endsWith("/api/site-setups/proj_new/documentation/generate") && method === "POST") {
      didGenerateDocumentation = true;
      return new Response(createDocumentationGenerationStream(generatedDocumentation, generatedBackendDocumentation, streamDelayMs), {
        headers: { "content-type": "text/event-stream" }
      });
    }

    if (url.endsWith("/api/site-setups/proj_new/complete") && method === "POST") {
      return new Response(
        JSON.stringify({
          site: newSite,
          snippet: '<script async src="http://localhost:4000/widget.js" data-barkan-site="site_new_key"></script>',
          apiKeys: [
            {
              id: "key_new",
              name: "CLI key",
              prefix: "ck_onboard",
              createdAt: "2026-05-18T00:01:00.000Z",
              lastUsedAt: null
            }
          ],
          documentation: didGenerateDocumentation ? generatedDocumentation : null,
          backendDocumentation: didGenerateDocumentation ? generatedBackendDocumentation : null,
          sourceContext: null,
          documentationAgent
        })
      );
    }

    return new Response(JSON.stringify({ error: "unexpected" }), { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createDocumentationGenerationStream(
  documentation: unknown,
  backendDocumentation: unknown | null = null,
  delayMs = 5
) {
  const encoder = new TextEncoder();
  const chunks = [
    "event: step_started\ndata: {\"step\":\"files_selection\",\"total\":2}\n\n",
    "event: step_progress\ndata: {\"step\":\"files_selection\",\"current\":1,\"total\":2,\"label\":\"1/2 batches\"}\n\n",
    "event: step_completed\ndata: {\"step\":\"files_selection\",\"current\":2,\"total\":2}\n\n",
    "event: step_started\ndata: {\"step\":\"frontend_documentation\",\"total\":2}\n\n",
    "event: step_progress\ndata: {\"step\":\"frontend_documentation\",\"current\":1,\"total\":2,\"label\":\"1/2 files\"}\n\n",
    "event: step_completed\ndata: {\"step\":\"frontend_documentation\",\"current\":2,\"total\":2}\n\n",
    "event: step_started\ndata: {\"step\":\"backend_documentation\"}\n\n",
    "event: step_completed\ndata: {\"step\":\"backend_documentation\"}\n\n",
    `event: completed\ndata: ${JSON.stringify({ documentation, backendDocumentation })}\n\n`
  ];

  return new ReadableStream({
    start(controller) {
      let index = 0;
      const push = () => {
        if (index >= chunks.length) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        window.setTimeout(push, delayMs);
      };

      push();
    }
  });
}
