import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
  getProviders: () => ["anthropic", "openai", "openai-codex"],
  getModels: (provider: string) => {
    if (provider === "anthropic") {
      return [
        { id: "claude-sonnet-test", name: "Claude Sonnet Test" },
        { id: "claude-haiku-test", name: "Claude Haiku Test" },
      ];
    }
    if (provider === "openai") {
      return [{ id: "gpt-5-test", name: "GPT-5 Test" }];
    }
    if (provider === "openai-codex") {
      return [{ id: "gpt-5-codex-test", name: "GPT-5 Codex Test" }];
    }
    return [];
  },
  getEnvApiKey: () => undefined,
  getOAuthApiKey: async () => null,
}));

import { listPiAiModelOptions } from "./pi-credentials.js";

describe("listPiAiModelOptions", () => {
  const originalPiDir = process.env.PI_CODING_AGENT_DIR;

  afterEach(() => {
    if (originalPiDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalPiDir;
    }
  });

  it("returns credential-backed models and marks the default model", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-models-"));
    process.env.PI_CODING_AGENT_DIR = tmp;

    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test" },
          "openai-codex": {
            type: "oauth",
            access: "access-token",
            refresh: "refresh-token",
            expires: Date.now() + 60_000,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await fs.writeFile(
      path.join(tmp, "settings.json"),
      JSON.stringify(
        {
          defaultProvider: "anthropic",
          defaultModel: "claude-sonnet-test",
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await listPiAiModelOptions();

    expect(result.defaultModelSpec).toBe("anthropic/claude-sonnet-test");
    expect(
      result.models.some((m) => m.id === "anthropic/claude-sonnet-test"),
    ).toBe(true);
    expect(
      result.models.some(
        (m) => m.id === "anthropic/claude-sonnet-test" && m.isDefault,
      ),
    ).toBe(true);
    expect(
      result.models.some((m) => m.id === "openai-codex/gpt-5-codex-test"),
    ).toBe(true);
    expect(result.models.some((m) => m.id === "openai/gpt-5-test")).toBe(false);
  });

  it("returns an empty model list when no credentials are configured", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-models-"));
    process.env.PI_CODING_AGENT_DIR = tmp;

    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify({}, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(tmp, "settings.json"),
      JSON.stringify({}, null, 2),
      "utf8",
    );

    const result = await listPiAiModelOptions();

    expect(result.defaultModelSpec).toBeUndefined();
    expect(result.models).toEqual([]);
  });
});
