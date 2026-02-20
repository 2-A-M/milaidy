/**
 * ANSI/terminal utility functions for processing PTY output.
 *
 * Pure functions — no state, no dependencies beyond the standard library.
 *
 * @module services/ansi-utils
 */

/**
 * Strip ANSI escape sequences from raw terminal output for readable text.
 * Replaces cursor-forward codes with spaces (TUI uses these instead of actual spaces).
 */
export function stripAnsi(raw: string): string {
  return raw
    .replace(/\x1b\[\d*[CDABGdEF]/g, " ")          // cursor movement → space
    .replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, " ")        // cursor positioning → space
    .replace(/\x1b\[\d*[JK]/g, "")                   // erase line/screen
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC sequences (title bars)
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "") // all other ANSI
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")     // control chars
    .replace(/ {3,}/g, " ")                           // collapse long space runs
    .trim();
}

/**
 * Capture the agent's output since the last task was sent, stripped of ANSI codes.
 * Returns the raw response text, or empty string if no marker exists.
 *
 * Mutates `markers` by deleting the entry for `sessionId` after capture.
 */
export function captureTaskResponse(
  sessionId: string,
  buffers: Map<string, string[]>,
  markers: Map<string, number>,
): string {
  const buffer = buffers.get(sessionId);
  const marker = markers.get(sessionId);
  if (!buffer || marker === undefined) return "";

  const responseLines = buffer.slice(marker);
  markers.delete(sessionId);

  // Join and strip ANSI escape sequences for clean text
  const raw = responseLines.join("\n");
  return raw
    .replace(/\x1b\[\d*[CDABGdEF]/g, " ")          // cursor movement → space
    .replace(/\x1b\[\d*(?:;\d+)?[Hf]/g, " ")        // cursor positioning → space
    .replace(/\x1b\[\d*[JK]/g, "")                   // erase line/screen
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "") // all other ANSI
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")     // control chars
    .replace(/ {3,}/g, " ")                           // collapse long space runs
    .trim();
}
