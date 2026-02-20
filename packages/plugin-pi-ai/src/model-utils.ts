import { type Api, getModel, type Model } from "@mariozechner/pi-ai";

export const DEFAULT_PI_MODEL_SPEC = "anthropic/claude-sonnet-4-20250514";

export type ModelSpecParts = {
  provider: string;
  id: string;
};

export function parseModelSpec(spec: string): ModelSpecParts {
  const [provider, ...rest] = spec.split("/");
  if (!provider || rest.length === 0) {
    throw new Error(
      `Invalid model spec: ${spec}. Expected format: provider/modelId`,
    );
  }
  return { provider, id: rest.join("/") };
}

/**
 * pi-ai's getModel() is typed with provider literals.
 * This plugin accepts provider/model IDs dynamically from config/runtime,
 * so we expose a safe wrapper for dynamic string lookups.
 */
export function getPiModel(provider: string, modelId: string): Model<Api> {
  const getModelUnsafe = getModel as unknown as (
    p: string,
    m: string,
  ) => Model<Api>;
  return getModelUnsafe(provider, modelId);
}
