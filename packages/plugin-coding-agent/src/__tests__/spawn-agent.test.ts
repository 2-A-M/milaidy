/**
 * SPAWN_CODING_AGENT action tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawnAgentAction } from "../actions/spawn-agent.js";

// Mock PTYService
const mockSpawnSession = vi.fn();
const mockOnSessionEvent = vi.fn();

const createMockPTYService = () => ({
  spawnSession: mockSpawnSession,
  onSessionEvent: mockOnSessionEvent,
  getSession: vi.fn(),
  listSessions: vi.fn().mockReturnValue([]),
});

// Mock runtime
const createMockRuntime = (ptyService: any = null) => ({
  getService: vi.fn((name: string) => {
    if (name === "PTY_SERVICE") return ptyService;
    return null;
  }),
  getSetting: vi.fn(),
});

// Mock message
const createMockMessage = (content: Record<string, unknown> = {}) => ({
  id: "msg-123",
  userId: "user-456",
  content,
  roomId: "room-789",
  createdAt: Date.now(),
});

describe("spawnAgentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSession.mockResolvedValue({
      id: "session-123",
      agentType: "claude-code",
      workdir: "/test/path",
      status: "running",
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });
  });

  describe("action metadata", () => {
    it("should have correct name", () => {
      expect(spawnAgentAction.name).toBe("SPAWN_CODING_AGENT");
    });

    it("should have similes for matching", () => {
      expect(spawnAgentAction.similes).toContain("START_CODING_AGENT");
      expect(spawnAgentAction.similes).toContain("LAUNCH_CODING_AGENT");
    });

    it("should have description", () => {
      expect(spawnAgentAction.description).toBeDefined();
      expect(spawnAgentAction.description).toContain("coding agent");
    });

    it("should have examples", () => {
      expect(spawnAgentAction.examples).toBeDefined();
      expect(spawnAgentAction.examples!.length).toBeGreaterThan(0);
    });

    it("should define parameters", () => {
      expect(spawnAgentAction.parameters).toBeDefined();
      const paramNames = spawnAgentAction.parameters!.map((p) => p.name);
      expect(paramNames).toContain("agentType");
      expect(paramNames).toContain("workdir");
      expect(paramNames).toContain("task");
    });
  });

  describe("validate", () => {
    it("should return true when PTYService is available", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage();

      const result = await spawnAgentAction.validate!(runtime as any, message as any);
      expect(result).toBe(true);
    });

    it("should return false when PTYService is not available", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage();

      const result = await spawnAgentAction.validate!(runtime as any, message as any);
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("should spawn a coding agent session", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude-code",
        workdir: "/test/path",
        task: "Fix the bug",
      });
      const callback = vi.fn();

      const result = await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(result?.success).toBe(true);
      expect(mockSpawnSession).toHaveBeenCalledWith({
        name: expect.stringContaining("coding-"),
        agentType: "claude-code",
        workdir: "/test/path",
        initialTask: "Fix the bug",
        metadata: expect.objectContaining({
          requestedType: "claude-code",
          messageId: "msg-123",
        }),
      });
    });

    it("should use default agent type if not specified", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ workdir: "/test" });
      const callback = vi.fn();

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "claude-code",
        })
      );
    });

    it("should map agent type aliases", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "claude" });
      const callback = vi.fn();

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "claude-code",
        })
      );
    });

    it("should map codex to shell adapter", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "codex" });
      const callback = vi.fn();

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "shell",
        })
      );
    });

    it("should use current directory if workdir not specified", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "claude-code" });
      const callback = vi.fn();

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(mockSpawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          workdir: expect.any(String),
        })
      );
    });

    it("should call callback with success message", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({
        agentType: "claude-code",
        workdir: "/test",
      });
      const callback = vi.fn();

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Started"),
        })
      );
    });

    it("should store session in state", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "claude-code" });
      const state: any = {};
      const callback = vi.fn();

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        state,
        {},
        callback
      );

      expect(state.codingSession).toBeDefined();
      expect(state.codingSession.id).toBe("session-123");
    });

    it("should register session event handler", async () => {
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "claude-code" });

      await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        vi.fn()
      );

      expect(mockOnSessionEvent).toHaveBeenCalled();
    });

    it("should return false when PTYService not available", async () => {
      const runtime = createMockRuntime(null);
      const message = createMockMessage({});
      const callback = vi.fn();

      const result = await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("not available"),
        })
      );
    });

    it("should handle spawn errors", async () => {
      mockSpawnSession.mockRejectedValue(new Error("PTY spawn failed"));
      const ptyService = createMockPTYService();
      const runtime = createMockRuntime(ptyService);
      const message = createMockMessage({ agentType: "claude-code" });
      const callback = vi.fn();

      const result = await spawnAgentAction.handler(
        runtime as any,
        message as any,
        undefined,
        {},
        callback
      );

      expect(result?.success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Failed"),
        })
      );
    });
  });
});
