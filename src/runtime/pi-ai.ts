import process from "node:process";
import type { IAgentRuntime } from "@elizaos/core";
import { type Api, getModel, type Model } from "@mariozechner/pi-ai";
import { registerPiAiModelHandler } from "../tui/pi-ai-model-handler.js";
import { createPiCredentialProvider } from "../tui/pi-credentials.js";

export function isPiAiEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.MILAIDY_USE_PI_AI;
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseModelSpec(spec: string): { provider: string; id: string } {
  const [provider, ...rest] = spec.split("/");
  if (!provider || rest.length === 0) {
    throw new Error(
      `Invalid model spec: ${spec}. Expected format: provider/modelId`,
    );
  }
  return { provider, id: rest.join("/") };
}

export type RegisterPiAiRuntimeOptions = {
  /**
   * Override the pi-ai model spec, format: provider/modelId
   * (e.g. anthropic/claude-sonnet-4-20250514)
   */
  modelSpec?: string;
  /** Register handler priority (higher wins over plugin providers). Default: 1000. */
  priority?: number;
};

export async function registerPiAiRuntime(
  runtime: IAgentRuntime,
  opts: RegisterPiAiRuntimeOptions = {},
): Promise<{ modelSpec: string; provider: string; id: string }> {
  const piCreds = await createPiCredentialProvider();

  const modelSpec =
    opts.modelSpec ??
    (await piCreds.getDefaultModelSpec()) ??
    "anthropic/claude-sonnet-4-20250514";

  const { provider, id } = parseModelSpec(modelSpec);

  // pi-ai's getModel is typed with provider literals; we support dynamic provider
  // strings (from config), so cast to a looser signature.
  const getModelUnsafe = getModel as unknown as (
    provider: string,
    modelId: string,
  ) => Model<Api>;

  const largeModel = getModelUnsafe(provider, id);
  const smallModel = largeModel;

  registerPiAiModelHandler(runtime, {
    largeModel,
    smallModel,
    providerName: "pi-ai",
    priority: opts.priority ?? 1000,
    getApiKey: (p) => piCreds.getApiKey(p),
  });

  return { modelSpec, provider, id };
}
