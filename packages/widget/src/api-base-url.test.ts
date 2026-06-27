import { describe, expect, it } from "vitest";
import { normalizeWidgetApiBaseUrl } from "./index";

describe("normalizeWidgetApiBaseUrl", () => {
  it("rejects cleartext non-local API URLs on HTTPS pages", () => {
    expect(() => normalizeWidgetApiBaseUrl("http://100.81.152.74:4001", "https:")).toThrow("must use HTTPS");
  });

  it("allows local HTTP development URLs on HTTPS pages", () => {
    expect(normalizeWidgetApiBaseUrl("http://localhost:4888", "https:")).toBe("http://localhost:4001");
  });
});
