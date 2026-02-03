import { Providers } from '@librechat/agents';
import { isOpenAILikeProvider, isDocumentSupportedProvider } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type {
  AnthropicDocumentBlock,
  StrategyFunctions,
  DocumentResult,
  ServerRequest,
} from '~/types';
import { getFileStream, getConfiguredFileSizeLimit } from './utils';
import { validatePdf } from '~/files/validation';

/**
 * Processes and encodes document files for various providers
 * @param req - Express request object
 * @param files - Array of file objects to process
 * @param params - Object containing provider, endpoint, and other options
 * @param params.provider - The provider name
 * @param params.endpoint - Optional endpoint name for file config lookup
 * @param params.useResponsesApi - Whether to use responses API format
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to documents and file metadata
 */
export async function encodeAndFormatDocuments(
  req: ServerRequest,
  files: IMongoFile[],
  params: { provider: Providers; endpoint?: string; useResponsesApi?: boolean },
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<DocumentResult> {
  const { provider, endpoint, useResponsesApi } = params;
  if (!files?.length) {
    return { documents: [], files: [] };
  }

  const encodingMethods: Record<string, StrategyFunctions> = {};
  const result: DocumentResult = { documents: [], files: [] };

  // Filter for all document types (PDFs and other application/* types, plus text files)
  const documentFiles = files.filter(
    (file) =>
      file.type === 'application/pdf' ||
      file.type?.startsWith('application/') ||
      file.type?.startsWith('text/'),
  );

  if (!documentFiles.length) {
    return result;
  }

  // Process all document types for providers that support documents
  const results = await Promise.allSettled(
    documentFiles.map((file) => {
      if (!isDocumentSupportedProvider(provider)) {
        return Promise.resolve(null);
      }
      return getFileStream(req, file, encodingMethods, getStrategyFunctions);
    }),
  );

  for (const settledResult of results) {
    if (settledResult.status === 'rejected') {
      console.error('Document processing failed:', settledResult.reason);
      continue;
    }

    const processed = settledResult.value;
    if (!processed) continue;

    const { file, content, metadata } = processed;

    if (!content || !file) {
      if (metadata) result.files.push(metadata);
      continue;
    }

    const isPdf = file.type === 'application/pdf';

    // Only validate PDFs
    if (isPdf) {
      const pdfBuffer = Buffer.from(content, 'base64');

      /** Extract configured file size limit from fileConfig for this endpoint */
      const configuredFileSizeLimit = getConfiguredFileSizeLimit(req, {
        provider,
        endpoint,
      });

      const validation = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        provider,
        configuredFileSizeLimit,
      );

      if (!validation.isValid) {
        throw new Error(`PDF validation failed: ${validation.error}`);
      }
    }

    // Format document for the appropriate provider
    if (provider === Providers.ANTHROPIC) {
      // Anthropic only supports PDFs natively
      if (isPdf) {
        const document: AnthropicDocumentBlock = {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: content,
          },
          citations: { enabled: true },
        };

        if (file.filename) {
          document.context = `File: "${file.filename}"`;
        }

        result.documents.push(document);
        result.files.push(metadata);
      }
    } else if (useResponsesApi) {
      result.documents.push({
        type: 'input_file',
        filename: file.filename,
        file_data: `data:${file.type};base64,${content}`,
      });
      result.files.push(metadata);
    } else if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
      // Google and Vertex use the media format
      result.documents.push({
        type: 'media',
        mimeType: file.type,
        data: content,
      });
      result.files.push(metadata);
    } else if (provider === Providers.OPENROUTER) {
      // OpenRouter routing to Gemini: use Gemini's native inline_data format
      result.documents.push({
        type: 'inline_data',
        inline_data: {
          mime_type: file.type,
          data: content,
        },
      });
      result.files.push(metadata);
    } else if (isOpenAILikeProvider(provider) && provider != Providers.AZURE) {
      // OpenAI only supports PDFs for document uploads
      if (isPdf) {
        result.documents.push({
          type: 'file',
          file: {
            filename: file.filename,
            file_data: `data:${file.type};base64,${content}`,
          },
        });
        result.files.push(metadata);
      }
    }
  }

  return result;
}
