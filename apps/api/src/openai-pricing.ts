export interface OpenAITokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface OpenAIPricingBreakdown {
  model: string;
  input_usd: number;
  cached_input_usd: number;
  output_usd: number;
  total_usd: number;
}

interface OpenAIModelPricing {
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

const openAIModelPricing: Record<string, OpenAIModelPricing> = {
  "gpt-5.5": {
    inputUsdPerMillionTokens: 5,
    cachedInputUsdPerMillionTokens: 0.5,
    outputUsdPerMillionTokens: 30
  },
  "gpt-5.4": {
    inputUsdPerMillionTokens: 2.5,
    cachedInputUsdPerMillionTokens: 0.25,
    outputUsdPerMillionTokens: 15
  },
  "gpt-5.4-nano": {
    inputUsdPerMillionTokens: 0.2,
    cachedInputUsdPerMillionTokens: 0.02,
    outputUsdPerMillionTokens: 1.25
  }
};

export function calculateOpenAIPricing(
  model: string,
  usage: OpenAITokenUsage
): OpenAIPricingBreakdown | null {
  const pricing = openAIModelPricing[normalizeOpenAIModelName(model)];
  if (!pricing) {
    return null;
  }

  const cachedInputTokens = clampTokenCount(usage.cached_input_tokens);
  const billableInputTokens = Math.max(0, clampTokenCount(usage.input_tokens) - cachedInputTokens);
  const outputTokens = clampTokenCount(usage.output_tokens);
  const inputUsd = calculateTokenCost(billableInputTokens, pricing.inputUsdPerMillionTokens);
  const cachedInputUsd = calculateTokenCost(cachedInputTokens, pricing.cachedInputUsdPerMillionTokens);
  const outputUsd = calculateTokenCost(outputTokens, pricing.outputUsdPerMillionTokens);

  return {
    model: normalizeOpenAIModelName(model),
    input_usd: inputUsd,
    cached_input_usd: cachedInputUsd,
    output_usd: outputUsd,
    total_usd: roundUsd(inputUsd + cachedInputUsd + outputUsd)
  };
}

function normalizeOpenAIModelName(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (/^gpt-5\.5-\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "gpt-5.5";
  }
  if (/^gpt-5\.4-\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "gpt-5.4";
  }
  if (/^gpt-5\.4-nano-\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "gpt-5.4-nano";
  }

  return normalized;
}

function clampTokenCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function calculateTokenCost(tokens: number, usdPerMillionTokens: number): number {
  return roundUsd((tokens / 1_000_000) * usdPerMillionTokens);
}

function roundUsd(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
