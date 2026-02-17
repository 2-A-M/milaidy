/**
 * PTY Service - Manages PTY sessions for CLI coding agents
 *
 * Wraps pty-manager to provide:
 * - Session lifecycle management (spawn, stop, list)
 * - Adapter registration for different agent types
 * - Event forwarding to ElizaOS runtime
 *
 * @module services/pty-service
 */

import {
  PTYManager,
  ShellAdapter,
  type SpawnConfig,
  type SessionHandle,
  type SessionMessage,
  type SessionFilter,
  type PTYManagerConfig,
} from "pty-manager";
import type { IAgentRuntime } from "@elizaos/core";

export interface PTYServiceConfig {
  /** Maximum output lines to keep per session (default: 1000) */
  maxLogLines?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface SpawnSessionOptions {
  /** Human-readable session name */
  name: string;
  /** Adapter type: "shell" | custom */
  agentType: string;
  /** Working directory for the session */
  workdir?: string;
  /** Initial command/task to send */
  initialTask?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Session metadata for tracking */
  metadata?: Record<string, unknown>;
}

export interface SessionInfo {
  id: string;
  name: string;
  agentType: string;
  workdir: string;
  status: SessionHandle["status"];
  createdAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

type SessionEventCallback = (sessionId: string, event: string, data: unknown) => void;

export class PTYService {
  static serviceType = "PTY_SERVICE";
  capabilityDescription = "Manages PTY sessions for CLI coding agents";

  private runtime: IAgentRuntime;
  private manager: PTYManager | null = null;
  private serviceConfig: PTYServiceConfig;
  private sessionMetadata: Map<string, Record<string, unknown>> = new Map();
  private eventCallbacks: SessionEventCallback[] = [];

  constructor(runtime: IAgentRuntime, config: PTYServiceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      maxLogLines: config.maxLogLines ?? 1000,
      debug: config.debug ?? false,
    };
  }

  static async start(runtime: IAgentRuntime): Promise<PTYService> {
    const config = runtime.getSetting("PTY_SERVICE_CONFIG") as PTYServiceConfig | undefined;
    const service = new PTYService(runtime, config);
    await service.initialize();
    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("PTY_SERVICE") as unknown as PTYService | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    const managerConfig: PTYManagerConfig = {
      maxLogLines: this.serviceConfig.maxLogLines,
    };

    this.manager = new PTYManager(managerConfig);

    // Register built-in adapters
    this.manager.registerAdapter(new ShellAdapter());

    // Set up event forwarding
    this.manager.on("session_ready", (session: SessionHandle) => {
      this.emitEvent(session.id, "ready", { session });
    });

    this.manager.on("blocking_prompt", (session: SessionHandle, promptInfo: unknown, autoResponded: boolean) => {
      this.emitEvent(session.id, "blocked", { promptInfo, autoResponded });
    });

    this.manager.on("session_stopped", (session: SessionHandle, reason: string) => {
      this.emitEvent(session.id, "stopped", { reason });
    });

    this.manager.on("session_error", (session: SessionHandle, error: string) => {
      this.emitEvent(session.id, "error", { message: error });
    });

    this.manager.on("message", (message: SessionMessage) => {
      this.emitEvent(message.sessionId, "message", message);
    });

    this.log("PTYService initialized");
  }

  async stop(): Promise<void> {
    if (this.manager) {
      await this.manager.shutdown();
      this.manager = null;
    }
    this.sessionMetadata.clear();
    this.log("PTYService shutdown complete");
  }

  /**
   * Spawn a new PTY session for a coding agent
   */
  async spawnSession(options: SpawnSessionOptions): Promise<SessionInfo> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const spawnConfig: SpawnConfig = {
      name: options.name,
      type: options.agentType,
      workdir: options.workdir,
      env: options.env,
    };

    const session = await this.manager.spawn(spawnConfig);

    // Store metadata separately
    if (options.metadata) {
      this.sessionMetadata.set(session.id, options.metadata);
    }

    const sessionInfo = this.toSessionInfo(session, options.workdir);

    // Send initial task if provided
    if (options.initialTask) {
      await this.sendToSession(session.id, options.initialTask);
    }

    this.log(`Spawned session ${session.id} (${options.agentType})`);
    return sessionInfo;
  }

  /**
   * Send input to a session
   */
  async sendToSession(sessionId: string, input: string): Promise<SessionMessage> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return this.manager.send(sessionId, input);
  }

  /**
   * Send keys to a session (for special key sequences)
   */
  async sendKeysToSession(sessionId: string, keys: string | string[]): Promise<void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const ptySession = this.manager.getSession(sessionId);
    if (!ptySession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    ptySession.sendKeys(keys);
  }

  /**
   * Stop a PTY session
   */
  async stopSession(sessionId: string): Promise<void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.manager.stop(sessionId);
    this.sessionMetadata.delete(sessionId);
    this.log(`Stopped session ${sessionId}`);
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SessionInfo | undefined {
    if (!this.manager) {
      return undefined;
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      return undefined;
    }

    return this.toSessionInfo(session);
  }

  /**
   * List all active sessions
   */
  listSessions(filter?: SessionFilter): SessionInfo[] {
    if (!this.manager) {
      return [];
    }

    return this.manager.list(filter).map((s) => this.toSessionInfo(s));
  }

  /**
   * Get recent output from a session
   */
  async getSessionOutput(sessionId: string, lines?: number): Promise<string> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const output: string[] = [];
    for await (const line of this.manager.logs(sessionId, { tail: lines })) {
      output.push(line);
    }
    return output.join("\n");
  }

  /**
   * Check if a session is waiting for input (blocked)
   */
  isSessionBlocked(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session?.status === "authenticating";
  }

  /**
   * Register a callback for session events
   */
  onSessionEvent(callback: SessionEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Register a custom adapter for new agent types
   */
  registerAdapter(adapter: unknown): void {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }
    this.manager.registerAdapter(adapter as Parameters<PTYManager["registerAdapter"]>[0]);
    this.log(`Registered adapter`);
  }

  private toSessionInfo(session: SessionHandle, workdir?: string): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      agentType: session.type,
      workdir: workdir ?? process.cwd(),
      status: session.status,
      createdAt: session.startedAt ?? new Date(),
      lastActivityAt: session.lastActivityAt ?? new Date(),
      metadata: this.sessionMetadata.get(session.id),
    };
  }

  private emitEvent(sessionId: string, event: string, data: unknown): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(sessionId, event, data);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      console.log(`[PTYService] ${message}`);
    }
  }
}
