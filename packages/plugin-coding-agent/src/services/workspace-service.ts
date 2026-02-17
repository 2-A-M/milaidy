/**
 * Coding Workspace Service - Manages git workspaces for coding tasks
 *
 * Wraps git-workspace-service to provide:
 * - Workspace provisioning (clone/worktree)
 * - Branch management
 * - Commit, push, and PR creation
 * - Credential management
 *
 * @module services/workspace-service
 */

import {
  WorkspaceService,
  CredentialService,
  MemoryTokenStore,
  type Workspace,
  type WorkspaceConfig,
  type WorkspaceFinalization,
  type PullRequestInfo,
  type WorkspaceEvent,
  type WorkspaceStatus,
} from "git-workspace-service";
import type { IAgentRuntime } from "@elizaos/core";
import * as path from "node:path";
import * as os from "node:os";

export interface CodingWorkspaceConfig {
  /** Base directory for workspaces (default: ~/.milaidy/workspaces) */
  baseDir?: string;
  /** Branch prefix (default: "milaidy") */
  branchPrefix?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface ProvisionWorkspaceOptions {
  /** Git repository URL */
  repo: string;
  /** Base branch to create from (default: "main") */
  baseBranch?: string;
  /** Use worktree instead of clone */
  useWorktree?: boolean;
  /** Parent workspace ID for worktree */
  parentWorkspaceId?: string;
  /** Execution context */
  execution?: { id: string; patternName: string };
  /** Task context */
  task?: { id: string; role: string; slug?: string };
  /** User-provided credentials */
  userCredentials?: { type: "pat" | "oauth" | "ssh"; token?: string };
}

export interface WorkspaceResult {
  id: string;
  path: string;
  branch: string;
  baseBranch: string;
  isWorktree: boolean;
  repo: string;
  status: WorkspaceStatus;
}

export interface CommitOptions {
  message: string;
  all?: boolean;
}

export interface PushOptions {
  setUpstream?: boolean;
  force?: boolean;
}

export interface PROptions {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
  labels?: string[];
  reviewers?: string[];
}

export interface WorkspaceStatusResult {
  branch: string;
  clean: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
}

type WorkspaceEventCallback = (event: WorkspaceEvent) => void;

export class CodingWorkspaceService {
  static serviceType = "CODING_WORKSPACE_SERVICE";
  capabilityDescription = "Manages git workspaces for coding tasks";

  private runtime: IAgentRuntime;
  private workspaceService: WorkspaceService | null = null;
  private credentialService: CredentialService | null = null;
  private serviceConfig: CodingWorkspaceConfig;
  private workspaces: Map<string, WorkspaceResult> = new Map();
  private eventCallbacks: WorkspaceEventCallback[] = [];

  constructor(runtime: IAgentRuntime, config: CodingWorkspaceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      baseDir: config.baseDir ?? path.join(os.homedir(), ".milaidy", "workspaces"),
      branchPrefix: config.branchPrefix ?? "milaidy",
      debug: config.debug ?? false,
    };
  }

  static async start(runtime: IAgentRuntime): Promise<CodingWorkspaceService> {
    const config = runtime.getSetting("CODING_WORKSPACE_CONFIG") as CodingWorkspaceConfig | undefined;
    const service = new CodingWorkspaceService(runtime, config);
    await service.initialize();
    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("CODING_WORKSPACE_SERVICE") as unknown as CodingWorkspaceService | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    // Initialize credential service with memory token store
    this.credentialService = new CredentialService({
      tokenStore: new MemoryTokenStore(),
    });

    // Initialize workspace service
    this.workspaceService = new WorkspaceService({
      config: {
        baseDir: this.serviceConfig.baseDir!,
        branchPrefix: this.serviceConfig.branchPrefix,
      },
      credentialService: this.credentialService,
      logger: this.serviceConfig.debug ? {
        info: (data: unknown, msg?: string) => console.log(`[WorkspaceService] ${msg ?? ""}`, data),
        warn: (data: unknown, msg?: string) => console.warn(`[WorkspaceService] ${msg ?? ""}`, data),
        error: (data: unknown, msg?: string) => console.error(`[WorkspaceService] ${msg ?? ""}`, data),
        debug: (data: unknown, msg?: string) => this.log(`${msg ?? ""}`),
      } : undefined,
    });

    await this.workspaceService.initialize();

    // Set up event forwarding
    this.workspaceService.onEvent((event: WorkspaceEvent) => {
      this.emitEvent(event);
    });

    this.log("CodingWorkspaceService initialized");
  }

  async stop(): Promise<void> {
    // Clean up all workspaces
    for (const [id] of this.workspaces) {
      try {
        await this.removeWorkspace(id);
      } catch (err) {
        this.log(`Error cleaning up workspace ${id}: ${err}`);
      }
    }
    this.workspaces.clear();
    this.workspaceService = null;
    this.credentialService = null;
    this.log("CodingWorkspaceService shutdown complete");
  }

  /**
   * Provision a new workspace
   */
  async provisionWorkspace(options: ProvisionWorkspaceOptions): Promise<WorkspaceResult> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    const executionId = options.execution?.id ?? `exec-${Date.now()}`;
    const taskId = options.task?.id ?? `task-${Date.now()}`;

    const workspaceConfig: WorkspaceConfig = {
      repo: options.repo,
      strategy: options.useWorktree ? "worktree" : "clone",
      parentWorkspace: options.parentWorkspaceId,
      branchStrategy: "feature_branch",
      baseBranch: options.baseBranch ?? "main",
      execution: {
        id: executionId,
        patternName: options.execution?.patternName ?? "milaidy-coding",
      },
      task: {
        id: taskId,
        role: options.task?.role ?? "coding-agent",
        slug: options.task?.slug,
      },
      userCredentials: options.userCredentials ? {
        type: options.userCredentials.type,
        token: options.userCredentials.token ?? "",
        provider: "github",
      } : undefined,
    };

    const workspace = await this.workspaceService.provision(workspaceConfig);

    const result: WorkspaceResult = {
      id: workspace.id,
      path: workspace.path,
      branch: workspace.branch.name,
      baseBranch: workspace.branch.baseBranch,
      isWorktree: workspace.strategy === "worktree",
      repo: workspace.repo,
      status: workspace.status,
    };

    this.workspaces.set(workspace.id, result);
    this.log(`Provisioned workspace ${workspace.id}`);
    return result;
  }

  /**
   * Get a workspace by ID
   */
  getWorkspace(id: string): WorkspaceResult | undefined {
    return this.workspaces.get(id);
  }

  /**
   * List all workspaces
   */
  listWorkspaces(): WorkspaceResult[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Get workspace status (git status)
   */
  async getStatus(workspaceId: string): Promise<WorkspaceStatusResult> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Execute git status in workspace
    const { execSync } = await import("node:child_process");

    const statusOutput = execSync("git status --porcelain", {
      cwd: workspace.path,
      encoding: "utf-8",
    });

    const branchOutput = execSync("git branch --show-current", {
      cwd: workspace.path,
      encoding: "utf-8",
    }).trim();

    const lines = statusOutput.split("\n").filter(Boolean);
    const modified: string[] = [];
    const staged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filename = line.slice(3);

      if (indexStatus === "?" && workTreeStatus === "?") {
        untracked.push(filename);
      } else if (indexStatus !== " " && indexStatus !== "?") {
        staged.push(filename);
      } else if (workTreeStatus !== " ") {
        modified.push(filename);
      }
    }

    return {
      branch: branchOutput,
      clean: lines.length === 0,
      modified,
      staged,
      untracked,
    };
  }

  /**
   * Commit changes in a workspace
   */
  async commit(workspaceId: string, options: CommitOptions): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const { execSync } = await import("node:child_process");

    if (options.all) {
      execSync("git add -A", { cwd: workspace.path });
    }

    execSync(`git commit -m "${options.message.replace(/"/g, '\\"')}"`, {
      cwd: workspace.path,
    });

    const hash = execSync("git rev-parse HEAD", {
      cwd: workspace.path,
      encoding: "utf-8",
    }).trim();

    this.log(`Committed ${hash.slice(0, 8)} in workspace ${workspaceId}`);
    return hash;
  }

  /**
   * Push changes to remote
   */
  async push(workspaceId: string, options?: PushOptions): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const { execSync } = await import("node:child_process");

    let cmd = "git push";
    if (options?.setUpstream) {
      cmd += ` -u origin ${workspace.branch}`;
    }
    if (options?.force) {
      cmd += " --force";
    }

    execSync(cmd, { cwd: workspace.path });
    this.log(`Pushed workspace ${workspaceId}`);
  }

  /**
   * Create a pull request
   */
  async createPR(workspaceId: string, options: PROptions): Promise<PullRequestInfo> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const finalization: WorkspaceFinalization = {
      push: false, // Already pushed
      createPr: true,
      pr: {
        title: options.title,
        body: options.body,
        targetBranch: options.base ?? workspace.baseBranch,
        draft: options.draft,
        labels: options.labels,
        reviewers: options.reviewers,
      },
      cleanup: false,
    };

    const result = await this.workspaceService.finalize(workspaceId, finalization);
    if (!result) {
      throw new Error("Failed to create PR");
    }

    this.log(`Created PR #${result.number} for workspace ${workspaceId}`);
    return result;
  }

  /**
   * Remove a workspace
   */
  async removeWorkspace(workspaceId: string): Promise<void> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    await this.workspaceService.cleanup(workspaceId);
    this.workspaces.delete(workspaceId);
    this.log(`Removed workspace ${workspaceId}`);
  }

  /**
   * Register a callback for workspace events
   */
  onEvent(callback: WorkspaceEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index !== -1) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  private emitEvent(event: WorkspaceEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      console.log(`[CodingWorkspaceService] ${message}`);
    }
  }
}
