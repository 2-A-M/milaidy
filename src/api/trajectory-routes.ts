/**
 * Trajectory API routes for the Milaidy Control UI.
 *
 * Provides endpoints for:
 * - Listing and searching trajectories
 * - Viewing trajectory details with LLM calls and provider accesses
 * - Exporting trajectories to JSON or CSV
 * - Deleting trajectories
 * - Getting trajectory statistics
 * - Enabling/disabling trajectory logging
 */

import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import type {
  PersistentTrajectoryLoggerService,
  TrajectoryExportOptions,
  TrajectoryListOptions,
} from "../services/trajectory-logger.js";

function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function errorResponse(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  jsonResponse(res, { error: message }, status);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to read request body";
    errorResponse(res, msg, 413);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errorResponse(res, "Request body must be a JSON object", 400);
      return null;
    }
    return parsed as T;
  } catch {
    errorResponse(res, "Invalid JSON in request body", 400);
    return null;
  }
}

function getTrajectoryLogger(
  runtime: AgentRuntime | null,
): PersistentTrajectoryLoggerService | null {
  if (!runtime) return null;
  return runtime.getService(
    "milaidy_trajectory_logger",
  ) as PersistentTrajectoryLoggerService | null;
}

async function handleGetTrajectories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  const options: TrajectoryListOptions = {
    limit: Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("limit")) || 50),
    ),
    offset: Math.max(0, Number(url.searchParams.get("offset")) || 0),
    source: url.searchParams.get("source") || undefined,
    status:
      (url.searchParams.get("status") as "active" | "completed" | "error") ||
      undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    search: url.searchParams.get("search") || undefined,
  };

  const result = await logger.listTrajectories(options);
  jsonResponse(res, result);
}

async function handleGetTrajectoryDetail(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  trajectoryId: string,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const detail = await logger.getTrajectoryDetail(trajectoryId);
  if (!detail) {
    errorResponse(res, `Trajectory "${trajectoryId}" not found`, 404);
    return;
  }

  jsonResponse(res, detail);
}

async function handleGetStats(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const stats = await logger.getStats();
  jsonResponse(res, stats);
}

async function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  jsonResponse(res, {
    enabled: logger.isEnabled(),
  });
}

async function handlePutConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<{ enabled?: boolean }>(req, res);
  if (!body) return;

  if (typeof body.enabled === "boolean") {
    logger.setEnabled(body.enabled);
  }

  jsonResponse(res, {
    enabled: logger.isEnabled(),
  });
}

async function handleExportTrajectories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<TrajectoryExportOptions>(req, res);
  if (!body) return;

  if (!body.format || (body.format !== "json" && body.format !== "csv")) {
    errorResponse(res, "Format must be 'json' or 'csv'", 400);
    return;
  }

  const result = await logger.exportTrajectories(body);

  res.statusCode = 200;
  res.setHeader("Content-Type", result.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${result.filename}"`,
  );
  res.end(result.data);
}

async function handleDeleteTrajectories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<{
    trajectoryIds?: string[];
    clearAll?: boolean;
  }>(req, res);
  if (!body) return;

  let deleted = 0;

  if (body.clearAll === true) {
    deleted = await logger.clearAllTrajectories();
  } else if (body.trajectoryIds && Array.isArray(body.trajectoryIds)) {
    deleted = await logger.deleteTrajectories(body.trajectoryIds);
  } else {
    errorResponse(
      res,
      "Request must include 'trajectoryIds' array or 'clearAll: true'",
      400,
    );
    return;
  }

  jsonResponse(res, { deleted });
}

/**
 * Route a trajectory API request. Returns true if handled, false if not matched.
 *
 * Expected URL patterns:
 *   GET    /api/trajectories                     - List trajectories
 *   GET    /api/trajectories/stats               - Get statistics
 *   GET    /api/trajectories/config              - Get logging config
 *   PUT    /api/trajectories/config              - Update logging config
 *   POST   /api/trajectories/export              - Export trajectories
 *   DELETE /api/trajectories                     - Delete trajectories
 *   GET    /api/trajectories/:id                 - Get trajectory detail
 */
export async function handleTrajectoryRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? "GET";

  if (!runtime?.adapter) {
    errorResponse(
      res,
      "Database not available. The agent may not be running or the database adapter is not initialized.",
      503,
    );
    return true;
  }

  if (method === "GET" && pathname === "/api/trajectories") {
    await handleGetTrajectories(req, res, runtime);
    return true;
  }

  if (method === "GET" && pathname === "/api/trajectories/stats") {
    await handleGetStats(req, res, runtime);
    return true;
  }

  if (method === "GET" && pathname === "/api/trajectories/config") {
    await handleGetConfig(req, res, runtime);
    return true;
  }

  if (method === "PUT" && pathname === "/api/trajectories/config") {
    await handlePutConfig(req, res, runtime);
    return true;
  }

  if (method === "POST" && pathname === "/api/trajectories/export") {
    await handleExportTrajectories(req, res, runtime);
    return true;
  }

  if (method === "DELETE" && pathname === "/api/trajectories") {
    await handleDeleteTrajectories(req, res, runtime);
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/trajectories\/([^/]+)$/);
  if (detailMatch && method === "GET") {
    const trajectoryId = decodeURIComponent(detailMatch[1]);
    if (
      trajectoryId !== "stats" &&
      trajectoryId !== "config" &&
      trajectoryId !== "export"
    ) {
      await handleGetTrajectoryDetail(req, res, runtime, trajectoryId);
      return true;
    }
  }

  return false;
}
