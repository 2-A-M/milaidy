/**
 * Persistent Trajectory Logger Service for Milaidy.
 *
 * Captures all LLM calls and provider accesses made during message handling,
 * storing them in the database for debugging, analysis, and export.
 *
 * Implements the same interface as ElizaOS TrajectoryLoggerService so the
 * runtime automatically calls into it when trajectory context is active.
 */

import crypto from "node:crypto";
import type { AgentRuntime } from "@elizaos/core";
import { logger, Service } from "@elizaos/core";

type SqlPrimitive = string | number | boolean | null;
interface SqlCellArray extends Array<SqlCell> {}
type SqlCell = SqlPrimitive | Date | SqlRow | SqlCellArray;
interface SqlRow {
  [key: string]: SqlCell;
}

interface SqlExecuteResult {
  rows: SqlRow[];
  fields?: Array<{ name: string }>;
}

export type TrajectoryScalar = string | number | boolean | null;
export type TrajectoryData = Record<string, TrajectoryScalar>;

export interface TrajectoryProviderAccess {
  id: string;
  trajectoryId: string;
  stepId: string;
  providerName: string;
  purpose: string;
  data: TrajectoryData;
  query?: TrajectoryData;
  timestamp: number;
  createdAt: string;
}

export interface TrajectoryLlmCall {
  id: string;
  trajectoryId: string;
  stepId: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  temperature: number;
  maxTokens: number;
  purpose: string;
  actionType: string;
  latencyMs: number;
  timestamp: number;
  promptTokens?: number;
  completionTokens?: number;
  createdAt: string;
}

export interface TrajectoryRecord {
  id: string;
  agentId: string;
  roomId: string | null;
  entityId: string | null;
  conversationId: string | null;
  source: string;
  status: "active" | "completed" | "error";
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TrajectoryListOptions {
  limit?: number;
  offset?: number;
  source?: string;
  status?: "active" | "completed" | "error";
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface TrajectoryListResult {
  trajectories: TrajectoryRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface TrajectoryDetailResult {
  trajectory: TrajectoryRecord;
  llmCalls: TrajectoryLlmCall[];
  providerAccesses: TrajectoryProviderAccess[];
}

export interface TrajectoryExportOptions {
  format: "json" | "csv";
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
}

export interface TrajectoryStats {
  totalTrajectories: number;
  totalLlmCalls: number;
  totalProviderAccesses: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  averageDurationMs: number;
  bySource: Record<string, number>;
  byModel: Record<string, number>;
}

interface ServiceOptions {
  getRuntime: () => AgentRuntime | null;
  enabled?: boolean;
}

function asNumber(value: SqlCell | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: SqlCell | undefined): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return null;
}

function asIsoString(value: SqlCell | undefined): string {
  if (value instanceof Date) return value.toISOString();
  const asText = asString(value);
  if (!asText) return new Date(0).toISOString();
  const parsed = new Date(asText);
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function pickCell(row: SqlRow, ...keys: string[]): SqlCell | undefined {
  for (const key of keys) {
    if (Object.hasOwn(row, key)) {
      return row[key];
    }
  }
  return undefined;
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object")
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export class PersistentTrajectoryLoggerService extends Service {
  static serviceType = "milaidy_trajectory_logger";
  capabilityDescription =
    "Captures and persists LLM calls and provider accesses for debugging and analysis";

  private readonly getRuntime: () => AgentRuntime | null;
  private enabled: boolean;
  private initialized = false;
  private activeTrajectories = new Map<string, string>();

  constructor(runtime: AgentRuntime | null, options: ServiceOptions) {
    super(runtime as AgentRuntime);
    this.getRuntime = options.getRuntime;
    this.enabled = options.enabled ?? true;
  }

  static async start(
    runtime: AgentRuntime,
    options?: ServiceOptions,
  ): Promise<Service> {
    const service = new PersistentTrajectoryLoggerService(runtime, {
      getRuntime: () => runtime,
      ...options,
    });
    await service.initialize();
    return service;
  }

  async stop(): Promise<void> {
    this.enabled = false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async getSqlHelper(): Promise<{
    raw: (query: string) => { queryChunks: object[] };
  }> {
    const drizzle = (await import("drizzle-orm")) as {
      sql: { raw: (query: string) => { queryChunks: object[] } };
    };
    return drizzle.sql;
  }

  private async executeRawSql(
    runtime: AgentRuntime,
    sqlText: string,
  ): Promise<{ rows: SqlRow[]; columns: string[] }> {
    const sqlHelper = await this.getSqlHelper();
    const db = runtime.adapter.db as {
      execute(query: { queryChunks: object[] }): Promise<SqlExecuteResult>;
    };
    const query = sqlHelper.raw(sqlText);
    const result = await db.execute(query);
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const columns =
      result.fields && Array.isArray(result.fields)
        ? result.fields.map((field) => field.name)
        : rows.length > 0
          ? Object.keys(rows[0])
          : [];
    return { rows, columns };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const runtime = this.getRuntime();
    if (!runtime?.adapter) {
      logger.warn(
        "[trajectory-logger] No runtime adapter available, skipping initialization",
      );
      return;
    }
    await this.ensureTablesExist(runtime);
    this.initialized = true;
    logger.info("[trajectory-logger] Persistent trajectory logger initialized");
  }

  private async ensureTablesExist(runtime: AgentRuntime): Promise<void> {
    await this.executeRawSql(
      runtime,
      `CREATE TABLE IF NOT EXISTS milaidy_trajectories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        room_id TEXT,
        entity_id TEXT,
        conversation_id TEXT,
        source TEXT NOT NULL DEFAULT 'chat',
        status TEXT NOT NULL DEFAULT 'active',
        start_time BIGINT NOT NULL,
        end_time BIGINT,
        duration_ms BIGINT,
        llm_call_count INTEGER NOT NULL DEFAULT 0,
        provider_access_count INTEGER NOT NULL DEFAULT 0,
        total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
        total_completion_tokens INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );

    await this.executeRawSql(
      runtime,
      `CREATE TABLE IF NOT EXISTS milaidy_trajectory_llm_calls (
        id TEXT PRIMARY KEY,
        trajectory_id TEXT NOT NULL REFERENCES milaidy_trajectories(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        user_prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        temperature REAL NOT NULL DEFAULT 0,
        max_tokens INTEGER NOT NULL DEFAULT 0,
        purpose TEXT NOT NULL DEFAULT 'response',
        action_type TEXT NOT NULL DEFAULT '',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );

    await this.executeRawSql(
      runtime,
      `CREATE TABLE IF NOT EXISTS milaidy_trajectory_provider_accesses (
        id TEXT PRIMARY KEY,
        trajectory_id TEXT NOT NULL REFERENCES milaidy_trajectories(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        query JSONB,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );

    await this.executeRawSql(
      runtime,
      `CREATE INDEX IF NOT EXISTS idx_milaidy_trajectories_agent_id ON milaidy_trajectories(agent_id)`,
    );
    await this.executeRawSql(
      runtime,
      `CREATE INDEX IF NOT EXISTS idx_milaidy_trajectories_source ON milaidy_trajectories(source)`,
    );
    await this.executeRawSql(
      runtime,
      `CREATE INDEX IF NOT EXISTS idx_milaidy_trajectories_status ON milaidy_trajectories(status)`,
    );
    await this.executeRawSql(
      runtime,
      `CREATE INDEX IF NOT EXISTS idx_milaidy_trajectories_created_at ON milaidy_trajectories(created_at)`,
    );
    await this.executeRawSql(
      runtime,
      `CREATE INDEX IF NOT EXISTS idx_milaidy_llm_calls_trajectory_id ON milaidy_trajectory_llm_calls(trajectory_id)`,
    );
    await this.executeRawSql(
      runtime,
      `CREATE INDEX IF NOT EXISTS idx_milaidy_provider_accesses_trajectory_id ON milaidy_trajectory_provider_accesses(trajectory_id)`,
    );
  }

  async startTrajectory(
    stepId: string,
    options: {
      agentId: string;
      roomId?: string;
      entityId?: string;
      conversationId?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    if (!this.enabled) return stepId;
    const runtime = this.getRuntime();
    if (!runtime?.adapter) return stepId;

    const trajectoryId = crypto.randomUUID();
    const now = Date.now();

    await this.executeRawSql(
      runtime,
      `INSERT INTO milaidy_trajectories (
        id, agent_id, room_id, entity_id, conversation_id, source, status,
        start_time, metadata
      ) VALUES (
        ${sqlLiteral(trajectoryId)},
        ${sqlLiteral(options.agentId)},
        ${sqlLiteral(options.roomId ?? null)},
        ${sqlLiteral(options.entityId ?? null)},
        ${sqlLiteral(options.conversationId ?? null)},
        ${sqlLiteral(options.source ?? "chat")},
        'active',
        ${now},
        ${sqlLiteral(options.metadata ?? {})}
      )`,
    );

    this.activeTrajectories.set(stepId, trajectoryId);
    return trajectoryId;
  }

  async endTrajectory(
    stepId: string,
    status: "completed" | "error" = "completed",
  ): Promise<void> {
    if (!this.enabled) return;
    const trajectoryId = this.activeTrajectories.get(stepId);
    if (!trajectoryId) return;

    const runtime = this.getRuntime();
    if (!runtime?.adapter) return;

    const now = Date.now();

    await this.executeRawSql(
      runtime,
      `UPDATE milaidy_trajectories SET
        status = ${sqlLiteral(status)},
        end_time = ${now},
        duration_ms = ${now} - start_time,
        updated_at = NOW()
      WHERE id = ${sqlLiteral(trajectoryId)}`,
    );

    this.activeTrajectories.delete(stepId);
  }

  logProviderAccess(params: {
    stepId: string;
    providerName: string;
    data: TrajectoryData;
    purpose: string;
    query?: TrajectoryData;
  }): void {
    if (!this.enabled) return;
    void this.logProviderAccessAsync(params);
  }

  private async logProviderAccessAsync(params: {
    stepId: string;
    providerName: string;
    data: TrajectoryData;
    purpose: string;
    query?: TrajectoryData;
  }): Promise<void> {
    const trajectoryId = this.activeTrajectories.get(params.stepId);
    if (!trajectoryId) {
      logger.debug(
        { stepId: params.stepId },
        "[trajectory-logger] No active trajectory for provider access",
      );
      return;
    }

    const runtime = this.getRuntime();
    if (!runtime?.adapter) return;

    const id = crypto.randomUUID();
    const now = Date.now();

    await this.executeRawSql(
      runtime,
      `INSERT INTO milaidy_trajectory_provider_accesses (
        id, trajectory_id, step_id, provider_name, purpose, data, query, timestamp
      ) VALUES (
        ${sqlLiteral(id)},
        ${sqlLiteral(trajectoryId)},
        ${sqlLiteral(params.stepId)},
        ${sqlLiteral(params.providerName)},
        ${sqlLiteral(params.purpose)},
        ${sqlLiteral(params.data)},
        ${sqlLiteral(params.query ?? null)},
        ${now}
      )`,
    );

    await this.executeRawSql(
      runtime,
      `UPDATE milaidy_trajectories SET
        provider_access_count = provider_access_count + 1,
        updated_at = NOW()
      WHERE id = ${sqlLiteral(trajectoryId)}`,
    );
  }

  logLlmCall(params: {
    stepId: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    response: string;
    temperature: number;
    maxTokens: number;
    purpose: string;
    actionType: string;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
  }): void {
    if (!this.enabled) return;
    void this.logLlmCallAsync(params);
  }

  private async logLlmCallAsync(params: {
    stepId: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    response: string;
    temperature: number;
    maxTokens: number;
    purpose: string;
    actionType: string;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
  }): Promise<void> {
    const trajectoryId = this.activeTrajectories.get(params.stepId);
    if (!trajectoryId) {
      logger.debug(
        { stepId: params.stepId },
        "[trajectory-logger] No active trajectory for LLM call",
      );
      return;
    }

    const runtime = this.getRuntime();
    if (!runtime?.adapter) return;

    const id = crypto.randomUUID();
    const now = Date.now();
    const promptTokens = params.promptTokens ?? 0;
    const completionTokens = params.completionTokens ?? 0;

    await this.executeRawSql(
      runtime,
      `INSERT INTO milaidy_trajectory_llm_calls (
        id, trajectory_id, step_id, model, system_prompt, user_prompt, response,
        temperature, max_tokens, purpose, action_type, latency_ms,
        prompt_tokens, completion_tokens, timestamp
      ) VALUES (
        ${sqlLiteral(id)},
        ${sqlLiteral(trajectoryId)},
        ${sqlLiteral(params.stepId)},
        ${sqlLiteral(params.model)},
        ${sqlLiteral(params.systemPrompt)},
        ${sqlLiteral(params.userPrompt)},
        ${sqlLiteral(params.response)},
        ${params.temperature},
        ${params.maxTokens},
        ${sqlLiteral(params.purpose)},
        ${sqlLiteral(params.actionType)},
        ${params.latencyMs},
        ${promptTokens},
        ${completionTokens},
        ${now}
      )`,
    );

    await this.executeRawSql(
      runtime,
      `UPDATE milaidy_trajectories SET
        llm_call_count = llm_call_count + 1,
        total_prompt_tokens = total_prompt_tokens + ${promptTokens},
        total_completion_tokens = total_completion_tokens + ${completionTokens},
        updated_at = NOW()
      WHERE id = ${sqlLiteral(trajectoryId)}`,
    );
  }

  getProviderAccessLogs(): readonly TrajectoryProviderAccess[] {
    return [];
  }

  getLlmCallLogs(): readonly TrajectoryLlmCall[] {
    return [];
  }

  async listTrajectories(
    options: TrajectoryListOptions = {},
  ): Promise<TrajectoryListResult> {
    const runtime = this.getRuntime();
    if (!runtime?.adapter) {
      return { trajectories: [], total: 0, offset: 0, limit: 50 };
    }

    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.min(500, Math.max(1, options.limit ?? 50));

    const whereClauses: string[] = [];
    if (options.source) {
      whereClauses.push(`source = ${sqlLiteral(options.source)}`);
    }
    if (options.status) {
      whereClauses.push(`status = ${sqlLiteral(options.status)}`);
    }
    if (options.startDate) {
      whereClauses.push(
        `created_at >= ${sqlLiteral(options.startDate)}::timestamptz`,
      );
    }
    if (options.endDate) {
      whereClauses.push(
        `created_at <= ${sqlLiteral(options.endDate)}::timestamptz`,
      );
    }
    if (options.search) {
      const escaped = options.search.replace(/'/g, "''").replace(/%/g, "\\%");
      whereClauses.push(`(
        id ILIKE '%${escaped}%' OR
        agent_id ILIKE '%${escaped}%' OR
        source ILIKE '%${escaped}%'
      )`);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countResult = await this.executeRawSql(
      runtime,
      `SELECT count(*)::int AS total FROM milaidy_trajectories ${whereClause}`,
    );
    const total = asNumber(pickCell(countResult.rows[0] ?? {}, "total")) ?? 0;

    const rowsResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM milaidy_trajectories
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
    );

    const trajectories = rowsResult.rows.map((row) =>
      this.rowToTrajectoryRecord(row),
    );

    return { trajectories, total, offset, limit };
  }

  async getTrajectoryDetail(
    trajectoryId: string,
  ): Promise<TrajectoryDetailResult | null> {
    const runtime = this.getRuntime();
    if (!runtime?.adapter) return null;

    const safeId = trajectoryId.replace(/'/g, "''");

    const trajectoryResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM milaidy_trajectories WHERE id = '${safeId}' LIMIT 1`,
    );

    if (trajectoryResult.rows.length === 0) return null;

    const trajectory = this.rowToTrajectoryRecord(trajectoryResult.rows[0]);

    const llmCallsResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM milaidy_trajectory_llm_calls
       WHERE trajectory_id = '${safeId}'
       ORDER BY timestamp ASC`,
    );

    const providerAccessesResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM milaidy_trajectory_provider_accesses
       WHERE trajectory_id = '${safeId}'
       ORDER BY timestamp ASC`,
    );

    const llmCalls = llmCallsResult.rows.map((row) => this.rowToLlmCall(row));

    const providerAccesses = providerAccessesResult.rows.map((row) =>
      this.rowToProviderAccess(row),
    );

    return { trajectory, llmCalls, providerAccesses };
  }

  async getStats(): Promise<TrajectoryStats> {
    const runtime = this.getRuntime();
    if (!runtime?.adapter) {
      return {
        totalTrajectories: 0,
        totalLlmCalls: 0,
        totalProviderAccesses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        averageDurationMs: 0,
        bySource: {},
        byModel: {},
      };
    }

    const statsResult = await this.executeRawSql(
      runtime,
      `SELECT
        count(*)::int AS total_trajectories,
        COALESCE(sum(llm_call_count), 0)::int AS total_llm_calls,
        COALESCE(sum(provider_access_count), 0)::int AS total_provider_accesses,
        COALESCE(sum(total_prompt_tokens), 0)::int AS total_prompt_tokens,
        COALESCE(sum(total_completion_tokens), 0)::int AS total_completion_tokens,
        COALESCE(avg(duration_ms), 0)::int AS avg_duration_ms
      FROM milaidy_trajectories`,
    );

    const sourceResult = await this.executeRawSql(
      runtime,
      `SELECT source, count(*)::int AS cnt
       FROM milaidy_trajectories
       GROUP BY source`,
    );

    const modelResult = await this.executeRawSql(
      runtime,
      `SELECT model, count(*)::int AS cnt
       FROM milaidy_trajectory_llm_calls
       GROUP BY model`,
    );

    const stats = statsResult.rows[0] ?? {};
    const bySource: Record<string, number> = {};
    const byModel: Record<string, number> = {};

    for (const row of sourceResult.rows) {
      const source = asString(pickCell(row, "source"));
      const cnt = asNumber(pickCell(row, "cnt"));
      if (source && cnt !== null) bySource[source] = cnt;
    }

    for (const row of modelResult.rows) {
      const model = asString(pickCell(row, "model"));
      const cnt = asNumber(pickCell(row, "cnt"));
      if (model && cnt !== null) byModel[model] = cnt;
    }

    return {
      totalTrajectories: asNumber(pickCell(stats, "total_trajectories")) ?? 0,
      totalLlmCalls: asNumber(pickCell(stats, "total_llm_calls")) ?? 0,
      totalProviderAccesses:
        asNumber(pickCell(stats, "total_provider_accesses")) ?? 0,
      totalPromptTokens: asNumber(pickCell(stats, "total_prompt_tokens")) ?? 0,
      totalCompletionTokens:
        asNumber(pickCell(stats, "total_completion_tokens")) ?? 0,
      averageDurationMs: asNumber(pickCell(stats, "avg_duration_ms")) ?? 0,
      bySource,
      byModel,
    };
  }

  async exportTrajectories(
    options: TrajectoryExportOptions,
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    const runtime = this.getRuntime();
    if (!runtime?.adapter) {
      throw new Error("Database not available");
    }

    const whereClauses: string[] = [];
    if (options.trajectoryIds && options.trajectoryIds.length > 0) {
      const ids = options.trajectoryIds.map(sqlLiteral).join(", ");
      whereClauses.push(`t.id IN (${ids})`);
    }
    if (options.startDate) {
      whereClauses.push(
        `t.created_at >= ${sqlLiteral(options.startDate)}::timestamptz`,
      );
    }
    if (options.endDate) {
      whereClauses.push(
        `t.created_at <= ${sqlLiteral(options.endDate)}::timestamptz`,
      );
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const trajectoriesResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM milaidy_trajectories t ${whereClause} ORDER BY t.created_at DESC`,
    );

    const exportData: Array<{
      trajectory: TrajectoryRecord;
      llmCalls: TrajectoryLlmCall[];
      providerAccesses: TrajectoryProviderAccess[];
    }> = [];

    for (const row of trajectoriesResult.rows) {
      const trajectory = this.rowToTrajectoryRecord(row);
      const detail = await this.getTrajectoryDetail(trajectory.id);
      if (detail) {
        const llmCalls = options.includePrompts
          ? detail.llmCalls
          : detail.llmCalls.map((call) => ({
              ...call,
              systemPrompt: "[redacted]",
              userPrompt: "[redacted]",
              response: "[redacted]",
            }));
        exportData.push({
          trajectory,
          llmCalls,
          providerAccesses: detail.providerAccesses,
        });
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (options.format === "csv") {
      const lines: string[] = [
        "trajectory_id,agent_id,source,status,start_time,end_time,duration_ms,llm_call_count,total_prompt_tokens,total_completion_tokens",
      ];
      for (const item of exportData) {
        const t = item.trajectory;
        lines.push(
          [
            t.id,
            t.agentId,
            t.source,
            t.status,
            t.startTime,
            t.endTime ?? "",
            t.durationMs ?? "",
            t.llmCallCount,
            t.totalPromptTokens,
            t.totalCompletionTokens,
          ].join(","),
        );
      }
      return {
        data: lines.join("\n"),
        filename: `trajectories-${timestamp}.csv`,
        mimeType: "text/csv",
      };
    }

    return {
      data: JSON.stringify(exportData, null, 2),
      filename: `trajectories-${timestamp}.json`,
      mimeType: "application/json",
    };
  }

  async deleteTrajectories(trajectoryIds: string[]): Promise<number> {
    const runtime = this.getRuntime();
    if (!runtime?.adapter) return 0;
    if (trajectoryIds.length === 0) return 0;

    const ids = trajectoryIds.map(sqlLiteral).join(", ");

    const result = await this.executeRawSql(
      runtime,
      `DELETE FROM milaidy_trajectories WHERE id IN (${ids}) RETURNING id`,
    );

    return result.rows.length;
  }

  async clearAllTrajectories(): Promise<number> {
    const runtime = this.getRuntime();
    if (!runtime?.adapter) return 0;

    const countResult = await this.executeRawSql(
      runtime,
      `SELECT count(*)::int AS cnt FROM milaidy_trajectories`,
    );
    const count = asNumber(pickCell(countResult.rows[0] ?? {}, "cnt")) ?? 0;

    await this.executeRawSql(runtime, `DELETE FROM milaidy_trajectories`);

    return count;
  }

  private rowToTrajectoryRecord(row: SqlRow): TrajectoryRecord {
    let metadata: Record<string, unknown> = {};
    const metadataCell = pickCell(row, "metadata");
    if (typeof metadataCell === "string") {
      try {
        metadata = JSON.parse(metadataCell);
      } catch {
        metadata = {};
      }
    } else if (
      typeof metadataCell === "object" &&
      metadataCell !== null &&
      !Array.isArray(metadataCell)
    ) {
      metadata = metadataCell as Record<string, unknown>;
    }

    return {
      id: asString(pickCell(row, "id")) ?? "",
      agentId: asString(pickCell(row, "agent_id")) ?? "",
      roomId: asString(pickCell(row, "room_id")),
      entityId: asString(pickCell(row, "entity_id")),
      conversationId: asString(pickCell(row, "conversation_id")),
      source: asString(pickCell(row, "source")) ?? "chat",
      status:
        (asString(pickCell(row, "status")) as
          | "active"
          | "completed"
          | "error") ?? "active",
      startTime: asNumber(pickCell(row, "start_time")) ?? 0,
      endTime: asNumber(pickCell(row, "end_time")),
      durationMs: asNumber(pickCell(row, "duration_ms")),
      llmCallCount: asNumber(pickCell(row, "llm_call_count")) ?? 0,
      providerAccessCount:
        asNumber(pickCell(row, "provider_access_count")) ?? 0,
      totalPromptTokens: asNumber(pickCell(row, "total_prompt_tokens")) ?? 0,
      totalCompletionTokens:
        asNumber(pickCell(row, "total_completion_tokens")) ?? 0,
      metadata,
      createdAt: asIsoString(pickCell(row, "created_at")),
      updatedAt: asIsoString(pickCell(row, "updated_at")),
    };
  }

  private rowToLlmCall(row: SqlRow): TrajectoryLlmCall {
    return {
      id: asString(pickCell(row, "id")) ?? "",
      trajectoryId: asString(pickCell(row, "trajectory_id")) ?? "",
      stepId: asString(pickCell(row, "step_id")) ?? "",
      model: asString(pickCell(row, "model")) ?? "",
      systemPrompt: asString(pickCell(row, "system_prompt")) ?? "",
      userPrompt: asString(pickCell(row, "user_prompt")) ?? "",
      response: asString(pickCell(row, "response")) ?? "",
      temperature: asNumber(pickCell(row, "temperature")) ?? 0,
      maxTokens: asNumber(pickCell(row, "max_tokens")) ?? 0,
      purpose: asString(pickCell(row, "purpose")) ?? "response",
      actionType: asString(pickCell(row, "action_type")) ?? "",
      latencyMs: asNumber(pickCell(row, "latency_ms")) ?? 0,
      promptTokens: asNumber(pickCell(row, "prompt_tokens")) ?? undefined,
      completionTokens:
        asNumber(pickCell(row, "completion_tokens")) ?? undefined,
      timestamp: asNumber(pickCell(row, "timestamp")) ?? 0,
      createdAt: asIsoString(pickCell(row, "created_at")),
    };
  }

  private rowToProviderAccess(row: SqlRow): TrajectoryProviderAccess {
    let data: TrajectoryData = {};
    let query: TrajectoryData | undefined;

    const dataCell = pickCell(row, "data");
    if (typeof dataCell === "string") {
      try {
        data = JSON.parse(dataCell);
      } catch {
        data = {};
      }
    } else if (
      typeof dataCell === "object" &&
      dataCell !== null &&
      !Array.isArray(dataCell)
    ) {
      data = dataCell as TrajectoryData;
    }

    const queryCell = pickCell(row, "query");
    if (typeof queryCell === "string") {
      try {
        query = JSON.parse(queryCell);
      } catch {
        query = undefined;
      }
    } else if (
      typeof queryCell === "object" &&
      queryCell !== null &&
      !Array.isArray(queryCell)
    ) {
      query = queryCell as TrajectoryData;
    }

    return {
      id: asString(pickCell(row, "id")) ?? "",
      trajectoryId: asString(pickCell(row, "trajectory_id")) ?? "",
      stepId: asString(pickCell(row, "step_id")) ?? "",
      providerName: asString(pickCell(row, "provider_name")) ?? "",
      purpose: asString(pickCell(row, "purpose")) ?? "",
      data,
      query,
      timestamp: asNumber(pickCell(row, "timestamp")) ?? 0,
      createdAt: asIsoString(pickCell(row, "created_at")),
    };
  }
}
