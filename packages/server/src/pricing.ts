import type { AgentUsageSnapshot, PricingEstimate, TokenCostEstimate } from "./types.js";

type TokenRates = {
  model: string;
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
};

const apiPricingSource = {
  label: "OpenAI API pricing",
  url: "https://openai.com/api/pricing"
};

const codexPricingSource = {
  label: "OpenAI Codex rate card",
  url: "https://help.openai.com/en/articles/20001106-codex-rate-card"
};

const openAiApiRates: Record<string, TokenRates> = {
  "gpt-5.5": rate("gpt-5.5", 5, 0.5, 30),
  "gpt-5.5-pro": rate("gpt-5.5-pro", 30, null, 180),
  "gpt-5.4": rate("gpt-5.4", 2.5, 0.25, 15),
  "gpt-5.4-mini": rate("gpt-5.4-mini", 0.75, 0.075, 4.5),
  "gpt-5.4-nano": rate("gpt-5.4-nano", 0.2, 0.02, 1.25),
  "gpt-5.2": rate("gpt-5.2", 1.75, 0.175, 14),
  "gpt-5.2-codex": rate("gpt-5.2-codex", 1.75, 0.175, 14),
  "gpt-5.1": rate("gpt-5.1", 1.25, 0.125, 10),
  "gpt-5.1-codex": rate("gpt-5.1-codex", 1.25, 0.125, 10),
  "gpt-5.1-codex-max": rate("gpt-5.1-codex-max", 1.25, 0.125, 10),
  "gpt-5": rate("gpt-5", 1.25, 0.125, 10),
  "gpt-5-codex": rate("gpt-5-codex", 1.25, 0.125, 10),
  "gpt-5-mini": rate("gpt-5-mini", 0.25, 0.025, 2),
  "gpt-5-nano": rate("gpt-5-nano", 0.05, 0.005, 0.4),
  "codex-mini-latest": rate("codex-mini-latest", 1.5, 0.375, 6)
};

const codexCreditRates: Record<string, TokenRates> = {
  "gpt-5.5": rate("gpt-5.5", 125, 12.5, 750),
  "gpt-5.4": rate("gpt-5.4", 62.5, 6.25, 375),
  "gpt-5.4-mini": rate("gpt-5.4-mini", 18.75, 1.875, 113),
  "gpt-5.3-codex": rate("gpt-5.3-codex", 43.75, 4.375, 350),
  "gpt-5.2": rate("gpt-5.2", 43.75, 4.375, 350),
  "gpt-5.2-codex": rate("gpt-5.2-codex", 43.75, 4.375, 350)
};

export function withPricingEstimate(snapshot: AgentUsageSnapshot): AgentUsageSnapshot {
  const pricing = estimatePricing(snapshot);
  return pricing ? { ...snapshot, pricing } : snapshot;
}

function estimatePricing(snapshot: AgentUsageSnapshot): PricingEstimate | null {
  const model = normalizeOpenAiModel(snapshot.model);
  if (!model) return null;

  const totalInputTokens = detailNumber(snapshot, "totalInputTokens");
  const totalCachedInputTokens = detailNumber(snapshot, "totalCachedInputTokens") ?? 0;
  const totalOutputTokens = detailNumber(snapshot, "totalOutputTokens");
  if (totalInputTokens == null || totalOutputTokens == null) return null;

  const basis = tokenBasis(totalInputTokens, totalCachedInputTokens, totalOutputTokens);
  const apiRates = openAiApiRates[model];
  const codexRates = codexCreditRates[model];
  if (!apiRates && !codexRates) return null;

  const lastInputTokens = detailNumber(snapshot, "inputTokens") ?? snapshot.currentContextTokens;
  const lastCachedInputTokens = detailNumber(snapshot, "cachedInputTokens") ?? 0;
  const lastOutputTokens = detailNumber(snapshot, "outputTokens");
  const lastBasis =
    lastInputTokens != null && lastOutputTokens != null
      ? tokenBasis(lastInputTokens, lastCachedInputTokens, lastOutputTokens)
      : null;

  return {
    model,
    provider: "openai",
    api: apiRates ? costEstimate(apiRates, basis, lastBasis, "USD") : undefined,
    codexCredits: codexRates ? costEstimate(codexRates, basis, lastBasis, "credits") : undefined,
    basis,
    sources: [
      ...(apiRates ? [apiPricingSource] : []),
      ...(codexRates ? [codexPricingSource] : [])
    ]
  };
}

function rate(
  model: string,
  inputPerMillion: number,
  cachedInputPerMillion: number | null,
  outputPerMillion: number
): TokenRates {
  return { model, inputPerMillion, cachedInputPerMillion, outputPerMillion };
}

function tokenBasis(inputTokens: number, cachedInputTokens: number, outputTokens: number) {
  const normalizedCached = Math.max(0, Math.min(inputTokens, cachedInputTokens));
  return {
    inputTokens,
    cachedInputTokens: normalizedCached,
    billableInputTokens: Math.max(0, inputTokens - normalizedCached),
    outputTokens
  };
}

function costEstimate(
  rates: TokenRates,
  totalBasis: ReturnType<typeof tokenBasis>,
  lastBasis: ReturnType<typeof tokenBasis> | null,
  unit: TokenCostEstimate["unit"]
): TokenCostEstimate {
  return {
    total: costForBasis(rates, totalBasis),
    lastTurn: lastBasis ? costForBasis(rates, lastBasis) : null,
    unit,
    inputPerMillion: rates.inputPerMillion,
    cachedInputPerMillion: rates.cachedInputPerMillion,
    outputPerMillion: rates.outputPerMillion
  };
}

function costForBasis(rates: TokenRates, basis: ReturnType<typeof tokenBasis>) {
  const cachedRate = rates.cachedInputPerMillion ?? rates.inputPerMillion;
  return (
    (basis.billableInputTokens * rates.inputPerMillion +
      basis.cachedInputTokens * cachedRate +
      basis.outputTokens * rates.outputPerMillion) /
    1_000_000
  );
}

function detailNumber(snapshot: AgentUsageSnapshot, key: string) {
  const value = snapshot.details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOpenAiModel(model: string | undefined) {
  if (!model) return null;
  const normalized = model.toLowerCase();
  const knownModels = [
    "codex-mini-latest",
    "gpt-5.5-pro",
    "gpt-5.5",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex",
    "gpt-5.1",
    "gpt-5-codex",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5"
  ];
  return knownModels.find((knownModel) => normalized.startsWith(knownModel)) ?? null;
}
