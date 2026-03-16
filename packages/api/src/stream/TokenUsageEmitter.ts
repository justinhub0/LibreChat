import type { UsageMetadata } from './interfaces/IJobStore';

type EmitFn = (eventData: Record<string, unknown>) => Promise<void> | void;

const EMIT_INTERVAL_MS = 30_000;

/**
 * Tracks cumulative token usage during streaming and emits periodic SSE events
 * when the stream has been active for at least 30 seconds.
 */
export class TokenUsageEmitter {
  private cumulativeInput = 0;
  private cumulativeOutput = 0;
  private lastEmitTime = 0;
  private readonly startTime: number;
  private readonly emit: EmitFn;
  private readonly maxContextTokens: number;

  constructor(emit: EmitFn, maxContextTokens: number) {
    this.emit = emit;
    this.maxContextTokens = maxContextTokens;
    this.startTime = Date.now();
  }

  onUsageUpdate(usage: UsageMetadata): void {
    this.cumulativeInput += Number(usage.input_tokens) || 0;
    this.cumulativeOutput += Number(usage.output_tokens) || 0;

    const now = Date.now();
    const elapsed = now - this.startTime;
    const sinceLastEmit = now - this.lastEmitTime;

    if (elapsed < EMIT_INTERVAL_MS || sinceLastEmit < EMIT_INTERVAL_MS) {
      return;
    }

    this.lastEmitTime = now;
    this.emit({
      tokenUsage: {
        promptTokens: this.cumulativeInput,
        completionTokens: this.cumulativeOutput,
        maxContextTokens: this.maxContextTokens,
      },
    });
  }
}
