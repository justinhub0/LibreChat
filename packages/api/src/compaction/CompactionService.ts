import type { TCompactionConfig } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Models that support context compaction via OpenAI's Responses API
 */
const COMPACTION_SUPPORTED_MODELS = ['gpt-5.2'];

/**
 * Default compaction configuration
 */
const DEFAULT_CONFIG: Required<TCompactionConfig> = {
  enabled: false,
  thresholdPercent: 0.70, // Lower threshold to trigger compaction earlier
  minTokensBeforeCompaction: 10000,
  preserveInstructions: true,
  compactionPrompt: undefined,
};

/**
 * Model context window sizes (in tokens)
 * Note: These should match actual model limits to trigger compaction before hitting API errors
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.2': 400000,
  'gpt-5.2-pro': 400000,
  'gpt-5.2-codex': 400000,
};

/**
 * Check if a model supports compaction
 */
export function supportsCompaction(model: string): boolean {
  if (!model) return false;
  const lowerModel = model.toLowerCase();
  return COMPACTION_SUPPORTED_MODELS.some((m) => lowerModel.includes(m));
}

/**
 * Get the context window size for a model
 */
function getContextWindow(model: string): number {
  const lowerModel = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lowerModel.includes(key)) {
      return value;
    }
  }
  return 128000; // Default context window
}

/**
 * Fixed token cost for images (OpenAI charges based on detail level, not data size)
 * High detail images can cost up to ~1000 tokens, we use a conservative estimate
 */
const IMAGE_TOKEN_ESTIMATE = 1000;

/**
 * Check if a string is base64 image data
 */
function isBase64ImageData(str: string): boolean {
  return str.startsWith('data:image/') || (str.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(str.slice(0, 100)));
}

/**
 * Rough token estimation (4 chars per token average)
 * Excludes base64 image data which would massively inflate the count
 */
function estimateTokens(content: string | unknown): number {
  if (typeof content === 'string') {
    // Don't count base64 image data as text tokens
    if (isBase64ImageData(content)) {
      return IMAGE_TOKEN_ESTIMATE;
    }
    return Math.ceil(content.length / 4);
  }
  if (Array.isArray(content)) {
    // Handle array content (like messages with images)
    let total = 0;
    for (const item of content) {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj.type === 'image_url' || obj.type === 'input_image') {
          // Fixed token cost for images
          total += IMAGE_TOKEN_ESTIMATE;
        } else if (obj.type === 'file' || obj.type === 'input_file') {
          // Fixed token cost for file attachments (PDFs, etc.)
          total += IMAGE_TOKEN_ESTIMATE;
        } else if (obj.type === 'text' || obj.type === 'input_text') {
          // Count text content normally
          const text = (obj.text || obj.content || '') as string;
          total += Math.ceil(text.length / 4);
        } else {
          // For other types, estimate without image data
          total += estimateTokensExcludingImages(obj);
        }
      }
    }
    return total;
  }
  if (typeof content === 'object' && content !== null) {
    return estimateTokensExcludingImages(content as Record<string, unknown>);
  }
  return 0;
}

/**
 * Estimate tokens for an object, excluding base64 image data
 */
function estimateTokensExcludingImages(obj: Record<string, unknown>): number {
  let total = 0;
  for (const [key, value] of Object.entries(obj)) {
    // Skip keys that typically contain image data
    if (key === 'url' || key === 'image_url' || key === 'data') {
      if (typeof value === 'string' && isBase64ImageData(value)) {
        total += IMAGE_TOKEN_ESTIMATE;
        continue;
      }
    }
    if (typeof value === 'string') {
      if (isBase64ImageData(value)) {
        total += IMAGE_TOKEN_ESTIMATE;
      } else {
        total += Math.ceil(value.length / 4);
      }
    } else if (typeof value === 'object' && value !== null) {
      total += estimateTokens(value);
    }
  }
  return total;
}

/**
 * Convert content item to OpenAI Responses API format
 * The Responses API uses 'input_text' and 'input_image' instead of 'text' and 'image_url'
 */
function convertContentItem(item: Record<string, unknown>): Record<string, unknown> {
  if (item.type === 'text') {
    return {
      type: 'input_text',
      text: item.text,
    };
  }
  if (item.type === 'image_url') {
    const imageUrl = item.image_url as Record<string, unknown>;
    return {
      type: 'input_image',
      image_url: imageUrl?.url || imageUrl,
    };
  }
  if (item.type === 'file') {
    // Convert Chat Completions file format to Responses API input_file format
    const file = item.file as Record<string, unknown>;
    return {
      type: 'input_file',
      filename: file?.filename,
      file_data: file?.file_data,
    };
  }
  if (item.type === 'input_file' || item.type === 'input_text' || item.type === 'input_image') {
    // Already in Responses API format
    return item;
  }
  // Return as-is for other types (media, document, inline_data, etc.)
  return item;
}

/**
 * Convert LangChain messages to OpenAI Responses API input format
 */
function convertToResponsesInput(
  messages: BaseMessage[],
  instructions?: string,
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = msg._getType() === 'human' ? 'user' : msg._getType() === 'ai' ? 'assistant' : 'system';

    if (typeof msg.content === 'string') {
      input.push({
        role,
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      // Handle complex content (text + images, etc.)
      // Convert content types for Responses API format
      const convertedContent = msg.content.map((item) =>
        convertContentItem(item as Record<string, unknown>),
      );
      input.push({
        role,
        content: convertedContent,
      });
    }
  }

  return input;
}

export interface CompactionServiceOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  config?: TCompactionConfig;
}

export interface CompactionResult {
  compacted: boolean;
  messages?: BaseMessage[];
  compactedInput?: Array<Record<string, unknown>>;
  originalTokens?: number;
  compactedTokens?: number;
}

/**
 * CompactionService handles calling OpenAI's /responses/compact endpoint
 * to compress conversation context when approaching token limits.
 */
export class CompactionService {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private config: Required<TCompactionConfig>;

  constructor(options: CompactionServiceOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.model = options.model;
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
    } as Required<TCompactionConfig>;
  }

  /**
   * Check if compaction should be triggered
   */
  shouldCompact(currentTokens: number): boolean {
    if (!this.config.enabled) {
      logger.debug(`[CompactionService] Compaction disabled`);
      return false;
    }

    if (!supportsCompaction(this.model)) {
      logger.debug(`[CompactionService] Model ${this.model} does not support compaction`);
      return false;
    }

    if (currentTokens < this.config.minTokensBeforeCompaction) {
      logger.debug(`[CompactionService] Tokens ${currentTokens} below min threshold ${this.config.minTokensBeforeCompaction}`);
      return false;
    }

    const contextWindow = getContextWindow(this.model);
    const threshold = contextWindow * this.config.thresholdPercent;
    const shouldCompact = currentTokens >= threshold;

    logger.debug(
      `[CompactionService] Token check: ${currentTokens} tokens, context window: ${contextWindow}, threshold: ${threshold} (${this.config.thresholdPercent * 100}%), shouldCompact: ${shouldCompact}`,
    );

    return shouldCompact;
  }

  /**
   * Estimate total tokens in a conversation
   */
  estimateConversationTokens(messages: BaseMessage[], instructions?: string): number {
    let total = 0;

    if (instructions) {
      total += estimateTokens(instructions);
    }

    for (const msg of messages) {
      total += estimateTokens(msg.content);
    }

    return total;
  }

  /**
   * Call the OpenAI /responses/compact endpoint to compact the conversation
   */
  async compact(
    messages: BaseMessage[],
    instructions?: string,
  ): Promise<CompactionResult> {
    const originalTokens = this.estimateConversationTokens(messages, instructions);

    if (!this.shouldCompact(originalTokens)) {
      return {
        compacted: false,
        originalTokens,
      };
    }

    logger.debug(
      `[CompactionService] Compacting conversation: ${originalTokens} tokens, model: ${this.model}`,
    );

    try {
      const input = convertToResponsesInput(messages, instructions);
      const baseURL = this.baseURL || 'https://api.openai.com/v1';

      // Call the compact endpoint using fetch since SDK may not support it directly
      const response = await fetch(`${baseURL}/responses/compact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input,
          ...(instructions && this.config.preserveInstructions
            ? { instructions }
            : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Compact API error: ${response.status} - ${errorText}`);
      }

      const compactedData = await response.json() as {
        output?: Array<Record<string, unknown>>;
        usage?: { total_tokens?: number };
      };

      const compactedTokens = compactedData?.usage?.total_tokens || estimateTokens(compactedData?.output);

      logger.debug(
        `[CompactionService] Compaction complete: ${originalTokens} -> ${compactedTokens} tokens`,
      );

      return {
        compacted: true,
        compactedInput: compactedData?.output,
        originalTokens,
        compactedTokens,
      };
    } catch (error) {
      logger.error('[CompactionService] Compaction failed:', error);
      // Return original messages on failure
      return {
        compacted: false,
        originalTokens,
      };
    }
  }
}

/**
 * Create a compaction service instance
 */
export function createCompactionService(options: CompactionServiceOptions): CompactionService {
  return new CompactionService(options);
}
