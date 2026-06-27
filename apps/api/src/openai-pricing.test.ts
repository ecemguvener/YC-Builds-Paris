import { describe, expect, it } from "vitest";
import { calculateOpenAIPricing } from "./openai-pricing.js";

describe("OpenAI pricing", () => {
  it("maps dated gpt-5.5 models to the gpt-5.5 pricing family", () => {
    expect(calculateOpenAIPricing("gpt-5.5-2026-04-23", {
      input_tokens: 1_000_000,
      cached_input_tokens: 200_000,
      output_tokens: 100_000,
      total_tokens: 1_100_000
    })).toEqual({
      model: "gpt-5.5",
      input_usd: 4,
      cached_input_usd: 0.1,
      output_usd: 3,
      total_usd: 7.1
    });
  });

  it("calculates gpt-5.4 usage with cached input tokens", () => {
    expect(calculateOpenAIPricing("gpt-5.4", {
      input_tokens: 1_000_000,
      cached_input_tokens: 200_000,
      output_tokens: 100_000,
      total_tokens: 1_100_000
    })).toEqual({
      model: "gpt-5.4",
      input_usd: 2,
      cached_input_usd: 0.05,
      output_usd: 1.5,
      total_usd: 3.55
    });
  });

  it("maps dated gpt-5.4 models to the gpt-5.4 pricing family", () => {
    expect(calculateOpenAIPricing("gpt-5.4-2026-03-05", {
      input_tokens: 1_000_000,
      cached_input_tokens: 200_000,
      output_tokens: 100_000,
      total_tokens: 1_100_000
    })).toEqual({
      model: "gpt-5.4",
      input_usd: 2,
      cached_input_usd: 0.05,
      output_usd: 1.5,
      total_usd: 3.55
    });
  });

  it("calculates gpt-5.4-nano usage with cached input tokens", () => {
    expect(calculateOpenAIPricing("gpt-5.4-nano", {
      input_tokens: 1_000_000,
      cached_input_tokens: 200_000,
      output_tokens: 100_000,
      total_tokens: 1_100_000
    })).toEqual({
      model: "gpt-5.4-nano",
      input_usd: 0.16,
      cached_input_usd: 0.004,
      output_usd: 0.125,
      total_usd: 0.289
    });
  });

  it("returns null for unpriced models", () => {
    expect(calculateOpenAIPricing("custom-model", {
      input_tokens: 1,
      cached_input_tokens: 0,
      output_tokens: 1,
      total_tokens: 2
    })).toBeNull();
  });
});
