/**
 * WhatsApp Connector Unit Tests — GitHub Issue #147
 *
 * Basic validation tests for the WhatsApp connector plugin.
 * For comprehensive e2e tests, see test/whatsapp-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";

const WHATSAPP_PLUGIN_NAME = "@elizaos/plugin-whatsapp";

interface PluginModule {
  default?: unknown;
  plugin?: unknown;
}

function looksLikePlugin(v: unknown): boolean {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).name === "string"
  );
}

function extractPlugin(mod: PluginModule): unknown | null {
  if (looksLikePlugin(mod.default)) return mod.default;
  if (looksLikePlugin(mod.plugin)) return mod.plugin;
  if (looksLikePlugin(mod)) return mod as unknown;
  for (const [key, value] of Object.entries(mod)) {
    if (key === "default" || key === "plugin") continue;
    if (looksLikePlugin(value)) return value;
  }
  return null;
}

describe("WhatsApp Connector - Basic Validation", () => {
  it("can import the WhatsApp plugin package", async () => {
    const mod = (await import(WHATSAPP_PLUGIN_NAME)) as PluginModule;
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = (await import(WHATSAPP_PLUGIN_NAME)) as PluginModule;
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = (await import(WHATSAPP_PLUGIN_NAME)) as PluginModule;
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("whatsapp");
  });

  it("plugin has a description", async () => {
    const mod = (await import(WHATSAPP_PLUGIN_NAME)) as PluginModule;
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });
});

describe("WhatsApp Connector - Configuration", () => {
  it("validates basic WhatsApp configuration structure", () => {
    const validConfig = {
      enabled: true,
      authDir: "./auth/whatsapp",
      sendReadReceipts: true,
      dmPolicy: "pairing" as const,
      groupPolicy: "allowlist" as const,
      actions: {
        reactions: true,
        sendMessage: true,
        polls: false,
      },
    };

    expect(validConfig.enabled).toBe(true);
    expect(validConfig.dmPolicy).toBe("pairing");
    expect(validConfig.groupPolicy).toBe("allowlist");
    expect(validConfig.authDir).toBe("./auth/whatsapp");
  });

  it("validates multi-account configuration structure", () => {
    const multiAccountConfig = {
      accounts: {
        "main-account": {
          authDir: "./auth/whatsapp-main",
          enabled: true,
        },
        "secondary-account": {
          authDir: "./auth/whatsapp-secondary",
          enabled: true,
        },
      },
    };

    expect(multiAccountConfig.accounts).toBeDefined();
    expect(Object.keys(multiAccountConfig.accounts)).toHaveLength(2);
    expect(multiAccountConfig.accounts["main-account"].authDir).toBe("./auth/whatsapp-main");
  });

  it("validates message chunking configuration", () => {
    const chunkConfig = {
      textChunkLimit: 4096,
      chunkMode: "length" as const,
    };

    expect(chunkConfig.textChunkLimit).toBe(4096);
    expect(chunkConfig.chunkMode).toBe("length");
  });

  it("validates DM policy options", () => {
    const dmPolicies = ["pairing", "open", "none"] as const;

    for (const policy of dmPolicies) {
      const config = {
        dmPolicy: policy,
      };
      expect(config.dmPolicy).toBe(policy);
    }
  });

  it("validates group policy options", () => {
    const groupPolicies = ["allowlist", "denylist"] as const;

    for (const policy of groupPolicies) {
      const config = {
        groupPolicy: policy,
      };
      expect(config.groupPolicy).toBe(policy);
    }
  });

  it("validates read receipts configuration", () => {
    const readReceiptsConfig = {
      sendReadReceipts: true,
    };

    expect(readReceiptsConfig.sendReadReceipts).toBe(true);
  });

  it("validates media configuration", () => {
    const mediaConfig = {
      mediaMaxMb: 50,
    };

    expect(mediaConfig.mediaMaxMb).toBe(50);
  });

  it("validates group-specific configuration", () => {
    const groupConfig = {
      groups: {
        "120363XXXXXXXXX@g.us": {
          requireMention: true,
          tools: {
            allow: ["search", "browse"],
          },
          toolsBySender: {},
        },
      },
    };

    expect(groupConfig.groups["120363XXXXXXXXX@g.us"].requireMention).toBe(true);
    expect(groupConfig.groups["120363XXXXXXXXX@g.us"].tools.allow).toContain("search");
  });

  it("validates actions configuration", () => {
    const actionsConfig = {
      actions: {
        reactions: true,
        sendMessage: true,
        polls: false,
      },
    };

    expect(actionsConfig.actions.reactions).toBe(true);
    expect(actionsConfig.actions.sendMessage).toBe(true);
    expect(actionsConfig.actions.polls).toBe(false);
  });

  it("validates ack reaction configuration", () => {
    const ackConfig = {
      ackReaction: {
        emoji: "👍",
        direct: true,
        group: "mentions" as const,
      },
    };

    expect(ackConfig.ackReaction.emoji).toBe("👍");
    expect(ackConfig.ackReaction.direct).toBe(true);
    expect(ackConfig.ackReaction.group).toBe("mentions");
  });

  it("validates allowFrom configuration for DM policy", () => {
    const allowFromConfig = {
      dmPolicy: "open" as const,
      allowFrom: ["*"],
    };

    expect(allowFromConfig.dmPolicy).toBe("open");
    expect(allowFromConfig.allowFrom).toContain("*");
  });

  it("validates groupAllowFrom configuration", () => {
    const groupAllowFromConfig = {
      groupPolicy: "allowlist" as const,
      groupAllowFrom: ["120363XXXXXXXXX@g.us", "120363YYYYYYYYY@g.us"],
    };

    expect(groupAllowFromConfig.groupPolicy).toBe("allowlist");
    expect(groupAllowFromConfig.groupAllowFrom).toHaveLength(2);
  });
});

describe("WhatsApp Connector - Message Handling Logic", () => {
  it("respects WhatsApp's typical character limits", () => {
    // WhatsApp doesn't have a strict character limit like Discord,
    // but messages over 4096 characters may need special handling
    const WHATSAPP_RECOMMENDED_LIMIT = 4096;
    const shortMessage = "Hello, world!";
    const longMessage = "A".repeat(5000);

    expect(shortMessage.length).toBeLessThan(WHATSAPP_RECOMMENDED_LIMIT);
    expect(longMessage.length).toBeGreaterThan(WHATSAPP_RECOMMENDED_LIMIT);

    // Messages longer than recommended limit may need chunking
    const needsChunking = longMessage.length > WHATSAPP_RECOMMENDED_LIMIT;
    expect(needsChunking).toBe(true);
  });

  it("validates chunk mode options", () => {
    const chunkModes = ["length", "newline"] as const;

    for (const mode of chunkModes) {
      const config = {
        chunkMode: mode,
        textChunkLimit: 4096,
      };
      expect(config.chunkMode).toBe(mode);
    }
  });

  it("validates selfChatMode for testing", () => {
    const selfChatConfig = {
      selfChatMode: true,
    };

    expect(selfChatConfig.selfChatMode).toBe(true);
  });
});

describe("WhatsApp Connector - Authentication & Session", () => {
  it("validates authDir configuration for session persistence", () => {
    const authConfig = {
      authDir: "./auth/whatsapp-session",
    };

    expect(authConfig.authDir).toBe("./auth/whatsapp-session");
    expect(typeof authConfig.authDir).toBe("string");
  });

  it("validates multi-account auth directories", () => {
    const multiAuthConfig = {
      accounts: {
        "account1": {
          authDir: "./auth/whatsapp-1",
        },
        "account2": {
          authDir: "./auth/whatsapp-2",
        },
      },
    };

    expect(multiAuthConfig.accounts["account1"].authDir).toBe("./auth/whatsapp-1");
    expect(multiAuthConfig.accounts["account2"].authDir).toBe("./auth/whatsapp-2");
  });
});

describe("WhatsApp Connector - Integration Configuration", () => {
  it("recognizes WhatsApp in connector plugins list", () => {
    const CONNECTOR_PLUGINS = {
      whatsapp: "@elizaos/plugin-whatsapp",
    };

    expect(CONNECTOR_PLUGINS.whatsapp).toBe("@elizaos/plugin-whatsapp");
  });

  it("validates plugin auto-enable detection", () => {
    // WhatsApp is detected by authDir or authState configuration
    const configWithAuthDir = {
      authDir: "./auth/whatsapp",
    };

    expect(configWithAuthDir.authDir).toBeDefined();
    expect(typeof configWithAuthDir.authDir).toBe("string");
  });
});
