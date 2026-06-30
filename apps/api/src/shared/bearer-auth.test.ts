import { describe, expect, it } from "vitest";
import { parseBearerToken } from "./http.js";

describe("parseBearerToken", () => {
  it("accepts a Bearer token with flexible whitespace and casing", () => {
    expect(parseBearerToken("Bearer token-123")).toBe("token-123");
    expect(parseBearerToken("bearer    token-123")).toBe("token-123");
    expect(parseBearerToken("  BEARER token-123  ")).toBe("token-123");
  });

  it("rejects missing, non-Bearer, or malformed authorization values", () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("Basic token-123")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer token-123 extra")).toBeNull();
    expect(parseBearerToken(["Bearer token-123"])).toBeNull();
  });
});
