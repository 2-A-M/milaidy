import { logger } from "@elizaos/core";
import type { TelegramChunk } from "./chunking.js";
import { smartChunkTelegramText } from "./chunking.js";

const TELEGRAM_SAFE_EDIT_INTERVAL_MS = 2000;
const STREAMING_CURSOR = "▌";

interface TelegramSendResult {
  message_id?: number;
  date?: number;
  text?: string;
}

interface TelegramApiLike {
  sendMessage: (
    chatId: number,
    text: string,
    extra?: Record<string, unknown>,
  ) => Promise<unknown>;
  editMessageText: (
    chatId: number,
    messageId: number,
    inlineMessageId: undefined,
    text: string,
    extra?: Record<string, unknown>,
  ) => Promise<unknown>;
}

export interface DraftStreamerOptions {
  chatId: number;
  telegram: TelegramApiLike;
  replyToMessageId?: number;
  editIntervalMs?: number;
  cursor?: string;
  initialText?: string;
  parseMode?: "HTML" | "MarkdownV2";
}

export class DraftStreamer {
  private readonly options: Required<
    Omit<DraftStreamerOptions, "replyToMessageId">
  > & {
    replyToMessageId?: number;
  };

  private draftMessage: TelegramSendResult | null = null;
  private draftMessageId: number | null = null;
  private latestText = "";
  private lastRenderedHtml = "";
  private lastEditAt = 0;
  private blinkOn = true;
  private flushTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(options: DraftStreamerOptions) {
    this.options = {
      ...options,
      editIntervalMs: options.editIntervalMs ?? TELEGRAM_SAFE_EDIT_INTERVAL_MS,
      cursor: options.cursor ?? STREAMING_CURSOR,
      initialText: options.initialText ?? STREAMING_CURSOR,
      parseMode: options.parseMode ?? "HTML",
    };
  }

  update(nextText: string) {
    if (this.stopped) return;
    this.latestText = nextText;
    this.scheduleFlush();
  }

  async flush() {
    if (this.stopped) return;
    await this.flushInternal(false);
  }

  async finalize(finalText: string, extra?: Record<string, unknown>) {
    if (this.stopped) return [];

    this.latestText = finalText;
    this.clearTimer();

    const finalChunks = smartChunkTelegramText(finalText);
    if (finalChunks.length === 0) {
      this.stop();
      return [];
    }

    await this.ensureDraftMessage();
    await this.flushInternal(true, extra, finalChunks[0]);

    const sentMessages: TelegramSendResult[] = [];
    if (this.draftMessage) {
      this.draftMessage.text = finalChunks[0].text;
      sentMessages.push(this.draftMessage);
    }

    for (let i = 1; i < finalChunks.length; i += 1) {
      const continuation = await this.options.telegram.sendMessage(
        this.options.chatId,
        finalChunks[i].html,
        {
          parse_mode: this.options.parseMode,
        },
      );
      sentMessages.push((continuation ?? {}) as TelegramSendResult);
    }

    this.stop();
    return sentMessages;
  }

  stop() {
    this.stopped = true;
    this.clearTimer();
  }

  private clearTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;

    const elapsed = Date.now() - this.lastEditAt;
    const waitMs = Math.max(this.options.editIntervalMs - elapsed, 0);

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushInternal(false);
    }, waitMs);
  }

  private async ensureDraftMessage() {
    if (this.draftMessageId) return;

    const draftText = this.options.initialText;
    const sent = (await this.options.telegram.sendMessage(
      this.options.chatId,
      draftText,
      {
        parse_mode: this.options.parseMode,
        reply_parameters: this.options.replyToMessageId
          ? { message_id: this.options.replyToMessageId }
          : undefined,
      },
    )) as TelegramSendResult;

    this.draftMessage = sent;
    this.draftMessageId = sent?.message_id ?? null;
  }

  private async flushInternal(
    isFinal: boolean,
    extra?: Record<string, unknown>,
    precomputedChunk?: TelegramChunk,
  ) {
    if (this.stopped) return;
    await this.ensureDraftMessage();

    if (!this.draftMessageId) {
      logger.warn(
        "[telegram-enhanced] Draft message id missing; draft streaming disabled for this response",
      );
      return;
    }

    const chunk =
      precomputedChunk ?? smartChunkTelegramText(this.latestText)[0];
    if (!chunk) return;

    const cursor = isFinal ? "" : this.blinkOn ? this.options.cursor : "";
    this.blinkOn = !this.blinkOn;

    const renderedHtml = `${chunk.html}${cursor}`;
    if (renderedHtml === this.lastRenderedHtml) {
      return;
    }

    try {
      const edited = await this.options.telegram.editMessageText(
        this.options.chatId,
        this.draftMessageId,
        undefined,
        renderedHtml,
        {
          parse_mode: this.options.parseMode,
          ...extra,
        },
      );

      this.lastRenderedHtml = renderedHtml;
      this.lastEditAt = Date.now();

      if (edited && typeof edited === "object") {
        this.draftMessage = edited as TelegramSendResult;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("message is not modified")) {
        return;
      }

      logger.debug(`[telegram-enhanced] Draft edit failed: ${message}`);

      try {
        const replacement = (await this.options.telegram.sendMessage(
          this.options.chatId,
          renderedHtml,
          {
            parse_mode: this.options.parseMode,
          },
        )) as TelegramSendResult;

        this.draftMessage = replacement;
        this.draftMessageId = replacement?.message_id ?? this.draftMessageId;
        this.lastRenderedHtml = renderedHtml;
        this.lastEditAt = Date.now();
      } catch (fallbackError) {
        logger.debug(
          `[telegram-enhanced] Draft fallback send failed: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`,
        );
      }
    }
  }
}

export async function simulateSentenceStream(
  text: string,
  onChunk: (currentText: string) => Promise<void> | void,
  delayMs = 200,
) {
  const sentences = splitIntoSentenceChunks(text);
  let current = "";

  for (const sentence of sentences) {
    current += sentence;
    await onChunk(current);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function splitIntoSentenceChunks(text: string): string[] {
  const normalized = (text ?? "").trim();
  if (!normalized) return [];

  const matches = normalized.match(/[^.!?\n]+[.!?]*\s*|\n+/g);
  if (!matches) return [normalized];

  return matches;
}
