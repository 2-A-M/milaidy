import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { isPiAiEnabledFromEnv, registerPiAiRuntime } from "./pi-ai.js";

describe("pi-ai runtime registration", () => {
  it("detects enable flag from env", () => {
    expect(isPiAiEnabledFromEnv({})).toBe(false);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "1" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "true" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "yes" })).toBe(true);
    expect(isPiAiEnabledFromEnv({ MILAIDY_USE_PI_AI: "0" })).toBe(false);
  });

  it("registers model handlers using pi settings/auth files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-ai-"));

    // Minimal pi auth/settings files.
    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test-key" },
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
          defaultModel: "claude-sonnet-4-20250514",
        },
        null,
        2,
      ),
      "utf8",
    );

    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tmp;

    try {
      const registerModel = vi.fn();
      const runtime = {
        registerModel,
      } as unknown as IAgentRuntime;

      const reg = await registerPiAiRuntime(runtime);
      expect(reg.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
      expect(registerModel).toHaveBeenCalled();
    } finally {
      if (saved === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = saved;
      }
    }
  });

  it("falls back to pi settings default when modelSpec provider has no credentials", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-ai-"));

    // Only anthropic has credentials — openai-codex does NOT.
    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test-key" },
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
          defaultModel: "claude-sonnet-4-20250514",
        },
        null,
        2,
      ),
      "utf8",
    );

    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tmp;

    try {
      const registerModel = vi.fn();
      const runtime = {
        registerModel,
      } as unknown as IAgentRuntime;

      // Pass a modelSpec whose provider (openai-codex) has no credentials.
      const reg = await registerPiAiRuntime(runtime, {
        modelSpec: "openai-codex/gpt-5.3-codex",
      });

      // Should fall back to pi settings default (anthropic), not openai-codex.
      expect(reg.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
      expect(reg.provider).toBe("anthropic");
    } finally {
      if (saved === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = saved;
      }
    }
  });

  it("ignores invalid modelSpec values and falls back to defaults", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-ai-"));

    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test-key" },
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
          defaultModel: "claude-sonnet-4-20250514",
        },
        null,
        2,
      ),
      "utf8",
    );

    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tmp;

    try {
      const registerModel = vi.fn();
      const runtime = {
        registerModel,
      } as unknown as IAgentRuntime;

      const reg = await registerPiAiRuntime(runtime, {
        modelSpec: "not-a-model-spec",
      });

      expect(reg.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
      expect(reg.provider).toBe("anthropic");
    } finally {
      if (saved === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = saved;
      }
    }
  });

  it("uses modelSpec when provider has valid credentials", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-pi-ai-"));

    await fs.writeFile(
      path.join(tmp, "auth.json"),
      JSON.stringify(
        {
          anthropic: { type: "api_key", key: "sk-ant-test-key" },
          "openai-codex": { type: "api_key", key: "sk-codex-test" },
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
          defaultModel: "claude-sonnet-4-20250514",
        },
        null,
        2,
      ),
      "utf8",
    );

    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tmp;

    try {
      const registerModel = vi.fn();
      const runtime = {
        registerModel,
      } as unknown as IAgentRuntime;

      // Pass a modelSpec whose provider has credentials.
      const reg = await registerPiAiRuntime(runtime, {
        modelSpec: "openai-codex/gpt-5.3-codex",
      });

      // Should use the provided spec since credentials exist.
      expect(reg.modelSpec).toBe("openai-codex/gpt-5.3-codex");
      expect(reg.provider).toBe("openai-codex");
    } finally {
      if (saved === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = saved;
      }
    }
  });
});
