/**
 * YouTube content transformation for Google/Vertex AI providers
 * Extracts YouTube URLs from text content and converts them to Gemini's media format with fileUri
 */

import { Providers } from '@librechat/agents';
import { extractYouTubeUrls, normalizeYouTubeUrl } from './youtube';

/** Content part with text */
interface TextContentPart {
  type: 'text';
  text: string;
}

/** Content part for Gemini media (YouTube URLs) - uses 'media' type with fileUri */
interface MediaContentPart {
  type: 'media';
  mimeType: string;
  fileUri: string;
}

/** Generic content part */
type ContentPart = TextContentPart | MediaContentPart | Record<string, unknown>;

/**
 * Checks if a content part is a text part
 */
function isTextPart(part: ContentPart): part is TextContentPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part &&
    typeof part.text === 'string'
  );
}

/**
 * Normalizes message content to an array of content parts
 * @param content - String or array of content parts
 * @returns Array of content parts
 */
function normalizeContent(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

/**
 * Transforms message content to include YouTube media parts for Google/Vertex AI providers
 *
 * The @librechat/agents package supports the 'media' content type with fileUri:
 * {
 *   type: "media",
 *   mimeType: "video/*",
 *   fileUri: "https://www.youtube.com/watch?v=VIDEO_ID"
 * }
 *
 * This function detects YouTube URLs in text content and appends media parts
 * so that Gemini can analyze the video content.
 *
 * @param content - Message content (string or array of content parts)
 * @param provider - The provider string (e.g., 'google', 'vertexai')
 * @returns Transformed content array with YouTube media parts appended
 */
export function transformYouTubeContent(
  content: string | ContentPart[],
  provider: string,
): ContentPart[] {
  // Only transform for Google/Vertex AI providers
  if (provider !== Providers.GOOGLE && provider !== Providers.VERTEXAI) {
    return normalizeContent(content);
  }

  const contentParts = normalizeContent(content);
  const result: ContentPart[] = [];
  const youtubeMediaParts: MediaContentPart[] = [];

  for (const part of contentParts) {
    // Pass through all existing parts unchanged
    result.push(part);

    // Extract YouTube URLs from text parts
    if (isTextPart(part)) {
      const youtubeMatches = extractYouTubeUrls(part.text);

      for (const match of youtubeMatches) {
        const normalizedUrl = normalizeYouTubeUrl(match.url);

        youtubeMediaParts.push({
          type: 'media',
          mimeType: 'video/*',
          fileUri: normalizedUrl,
        });
      }
    }
  }

  // Append YouTube media parts at the end
  if (youtubeMediaParts.length > 0) {
    result.push(...youtubeMediaParts);
  }

  return result;
}

/**
 * Checks if content contains YouTube URLs that would benefit from transformation
 * @param content - Message content (string or array of content parts)
 * @returns True if content contains YouTube URLs
 */
export function hasYouTubeUrls(content: string | ContentPart[]): boolean {
  const contentParts = normalizeContent(content);

  for (const part of contentParts) {
    if (isTextPart(part)) {
      const matches = extractYouTubeUrls(part.text);
      if (matches.length > 0) {
        return true;
      }
    }
  }

  return false;
}
