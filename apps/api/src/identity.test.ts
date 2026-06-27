import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerIdentityRoutes } from "./identity.js";
import type { AppConfig } from "./config.js";

const config = {
  PUBLIC_API_URL: "http://localhost:4001"
} as AppConfig;

describe("identity layer routes", () => {
  it("initializes an identity, gates actions, audits actions, and revokes the token", async () => {
    const app = Fastify({ logger: false });
    registerIdentityRoutes(app, config);

    const initResponse = await app.inject({
      method: "POST",
      url: "/api/identity/init",
      payload: {
        agent_name: "Maya",
        agent_runtime: "openclaw",
        use_case: "customer_discovery",
        tools: ["email", "phone", "calendar"]
      }
    });
    expect(initResponse.statusCode).toBe(201);

    const initPayload = initResponse.json<{
      agent_id: string;
      identity_token: string;
      email: string;
      tool_endpoints: Record<string, string>;
    }>();
    expect(initPayload.agent_id).toMatch(/^agent_maya_/);
    expect(initPayload.identity_token).toMatch(/^identity_live_/);
    expect(initPayload.email).toContain("@agents.barkan.dev");

    const blockedEmailResponse = await app.inject({
      method: "POST",
      url: "/api/tools/email/send",
      headers: { authorization: `Bearer ${initPayload.identity_token}` },
      payload: {
        to: "demo@example.com",
        subject: "Hello",
        body: "Can we talk?"
      }
    });
    expect(blockedEmailResponse.statusCode).toBe(403);

    const allowedEmailResponse = await app.inject({
      method: "POST",
      url: "/api/tools/email/send",
      headers: { authorization: `Bearer ${initPayload.identity_token}` },
      payload: {
        to: "demo@example.com",
        subject: "Hello",
        body: "Can we talk?",
        approved: true
      }
    });
    expect(allowedEmailResponse.statusCode).toBe(200);
    expect(allowedEmailResponse.json<{ ok: boolean }>().ok).toBe(true);

    const auditResponse = await app.inject({
      method: "GET",
      url: `/api/identity/${initPayload.agent_id}/audit-log`,
      headers: { authorization: `Bearer ${initPayload.identity_token}` }
    });
    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json<{ audit_log: Array<{ action: string }> }>().audit_log.map((entry) => entry.action)).toContain(
      "email.send"
    );

    const revokeResponse = await app.inject({
      method: "POST",
      url: "/api/identity/revoke",
      headers: { authorization: `Bearer ${initPayload.identity_token}` }
    });
    expect(revokeResponse.statusCode).toBe(200);

    const revokedEmailResponse = await app.inject({
      method: "POST",
      url: "/api/tools/email/send",
      headers: { authorization: `Bearer ${initPayload.identity_token}` },
      payload: {
        to: "demo@example.com",
        subject: "After revoke",
        body: "This should not send.",
        approved: true
      }
    });
    expect(revokedEmailResponse.statusCode).toBe(403);

    await app.close();
  });
});
