/**
 * YouTube URL detection and extraction utilities
 * Supports various YouTube URL formats for Gemini API integration
 */

/**
 * Regular expression for matching YouTube URLs
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - URLs with additional parameters (timestamps, playlists, etc.)
 */
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&][^\s]*)?/g;

/**
 * Represents a YouTube URL match with position information
 */
export interface YouTubeMatch {
  /** The full matched URL */
  url: string;
  /** The 11-character video ID */
  videoId: string;
  /** Start index in the original text */
  startIndex: number;
  /** End index in the original text */
  endIndex: number;
}

/**
 * Extracts YouTube URLs from text
 * @param text - The text to search for YouTube URLs
 * @returns Array of YouTube URL matches with their positions
 */
export function extractYouTubeUrls(text: string): YouTubeMatch[] {
  const matches: YouTubeMatch[] = [];
  const regex = new RegExp(YOUTUBE_REGEX.source, 'g');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      url: match[0],
      videoId: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Normalizes a YouTube URL to the standard watch format
 * @param url - Any supported YouTube URL format
 * @returns Normalized URL: https://www.youtube.com/watch?v=VIDEO_ID
 */
export function normalizeYouTubeUrl(url: string): string {
  const regex = new RegExp(YOUTUBE_REGEX.source);
  const match = regex.exec(url);

  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }

  // Return original URL if no match (shouldn't happen if called after validation)
  return url;
}

/**
 * Checks if a string contains YouTube URLs
 * @param text - The text to check
 * @returns True if YouTube URLs are found
 */
export function containsYouTubeUrl(text: string): boolean {
  const regex = new RegExp(YOUTUBE_REGEX.source);
  return regex.test(text);
}

/**
 * Extracts video ID from a YouTube URL
 * @param url - A YouTube URL
 * @returns The video ID or null if not found
 */
export function extractVideoId(url: string): string | null {
  const regex = new RegExp(YOUTUBE_REGEX.source);
  const match = regex.exec(url);
  return match ? match[1] : null;
}
