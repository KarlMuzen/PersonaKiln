import { GoogleGenAI } from '@google/genai';
import type { ConnectionProfile } from '../db';
import { useCardStore } from '../store/useCardStore';
import { useTokenTracker } from '../store/useTokenTracker';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
} from '../constants/models';

import type { CardPatch } from '../schemas/patchSchema';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  patches?: CardPatch[];
}

export interface LLMResponseSchema {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  onChunk?: (chunkText: string) => void;
  responseSchema?: LLMResponseSchema;
}

export interface LLMResponse {
  text: string;
  tokensUsed?: number;
  promptTokens?: number;
}

export function validateAndCleanBaseUrl(urlStr: string): string {
  if (!urlStr) return '';
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid Base API URL "${urlStr}": Must be a valid URL starting with http:// or https://`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid Base API URL protocol "${parsed.protocol}": Only http:// and https:// protocols are supported.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('Base API URL must not contain embedded user credentials.');
  }

  return parsed.toString().replace(/\/$/, '');
}

function recordLLMResponseUsage(
  profile: ConnectionProfile,
  options: LLMRequestOptions,
  res: LLMResponse
): LLMResponse {
  let promptTokens = res.promptTokens;
  let completionTokens: number | undefined = undefined;

  if (promptTokens !== undefined && res.tokensUsed !== undefined) {
    completionTokens = Math.max(0, res.tokensUsed - promptTokens);
  } else if (res.tokensUsed !== undefined) {
    promptTokens = Math.round(res.tokensUsed * 0.7);
    completionTokens = Math.round(res.tokensUsed * 0.3);
  } else {
    const inputChars =
      (options.systemPrompt || '').length +
      options.messages.reduce((acc, m) => acc + (m.content || '').length, 0);
    promptTokens = Math.max(1, Math.ceil(inputChars / 4));
    completionTokens = Math.max(1, Math.ceil((res.text || '').length / 4));
  }

  useTokenTracker
    .getState()
    .recordUsage(
      profile.uuid || profile.name || 'default',
      profile.name || profile.provider,
      profile.model || 'default',
      promptTokens,
      completionTokens
    );

  return res;
}

/**
 * Execute request for a single profile.
 */

/** Same API-key scrubbing as the HTTP-status error paths: the key becomes ***HIDDEN_KEY***. */
function scrubApiKey(text: string, apiKey?: string): string {
  return apiKey ? text.split(apiKey).join('***HIDDEN_KEY***') : text;
}

/** Message of an OpenAI-style stream error, or null when the chunk carries none. */
function openAIStreamErrorMessage(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const record = json as Record<string, unknown>;
  const fieldMessage = openAIErrorFieldMessage(record);
  if (fieldMessage !== null) return fieldMessage;
  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined;
    if (first?.finish_reason === 'error') return 'no message';
  }
  return null;
}

/** Message of a top-level `error` field, or null when the body carries none. */
function openAIErrorFieldMessage(record: Record<string, unknown>): string | null {
  const error = record.error;
  if (error === undefined || error === null) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    return typeof message === 'string' ? message : 'no message';
  }
  return 'no message';
}

/** Message of an Anthropic stream error, or null when the chunk carries none. */
function anthropicStreamErrorMessage(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const record = json as Record<string, unknown>;
  if (record.type !== 'error') return null;
  const error = record.error;
  if (typeof error === 'object' && error !== null) {
    const errRecord = error as Record<string, unknown>;
    const message = typeof errRecord.message === 'string' ? errRecord.message : 'no message';
    return typeof errRecord.type === 'string' ? `${errRecord.type}: ${message}` : message;
  }
  if (typeof error === 'string') return error;
  return 'no message';
}

export async function sendSingleLLMRequest(
  profile: ConnectionProfile,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  let apiKey = profile.apiKey;
  try {
    const decrypted = await useCardStore.getState().getDecryptedApiKey(profile);
    if (decrypted) apiKey = decrypted;
  } catch {
    // fallback to profile.apiKey
  }

  const { messages, temperature = 0.7, maxTokens = 1000, systemPrompt } = options;

  // 1. GEMINI PROVIDER
  if (profile.provider === 'gemini') {
    if (!apiKey) {
      throw new Error('Gemini API key is required. Please set it in Settings -> Connection Profiles.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = profile.model || DEFAULT_GEMINI_MODEL;

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const config: Record<string, unknown> = {
      systemInstruction: systemPrompt || messages.find((m) => m.role === 'system')?.content,
      temperature,
      maxOutputTokens: maxTokens,
    };

    if (options.responseSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = options.responseSchema.schema;
    }

    try {
      if (options.onChunk) {
        const responseStream = await ai.models.generateContentStream({
          model,
          contents,
          config,
        });

        let fullText = '';
        let tokensUsed: number | undefined = undefined;

        for await (const chunk of responseStream) {
          const textChunk = chunk.text || '';
          if (textChunk) {
            fullText += textChunk;
            options.onChunk(textChunk);
          }
          if (chunk.usageMetadata?.totalTokenCount) {
            tokensUsed = chunk.usageMetadata.totalTokenCount;
          }
        }

        return recordLLMResponseUsage(profile, options, { text: fullText, tokensUsed });
      } else {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });

        return recordLLMResponseUsage(profile, options, {
          text: response.text || '',
          tokensUsed: response.usageMetadata?.totalTokenCount,
        });
      }
    } catch (err: unknown) {
      const errObj = err as { message?: string } | undefined;
      let sanitizedErr = errObj?.message || String(err);
      if (apiKey) {
        sanitizedErr = sanitizedErr.split(apiKey).join('***HIDDEN_KEY***');
      }
      throw new Error(sanitizedErr);
    }
  }

  // 2. OPENAI / OPENROUTER / OLLAMA / CUSTOM
  if (
    profile.provider === 'openai' ||
    profile.provider === 'openrouter' ||
    profile.provider === 'ollama' ||
    profile.provider === 'custom'
  ) {
    let baseUrl = profile.baseUrl || 'https://api.openai.com/v1';
    if (profile.provider === 'openrouter' && !profile.baseUrl) {
      baseUrl = 'https://openrouter.ai/api/v1';
    }
    if (profile.provider === 'ollama' && !profile.baseUrl) {
      baseUrl = 'http://localhost:11434/v1';
    }

    const cleanBaseUrl = validateAndCleanBaseUrl(baseUrl);
    const endpoint = `${cleanBaseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (profile.provider === 'openrouter') {
      headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      headers['X-Title'] = 'PersonaKiln';
    }

    const formattedMessages: LLMMessage[] = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(...messages);

    const isStreaming = Boolean(options.onChunk);

    const body: Record<string, unknown> = {
      model: profile.model || DEFAULT_OPENAI_MODEL,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens,
      ...(isStreaming
        ? {
            stream: true,
            ...(profile.provider === 'openai' || profile.provider === 'openrouter'
              ? { stream_options: { include_usage: true } }
              : {}),
          }
        : {}),
    };

    if (options.responseSchema && (profile.provider === 'openai' || profile.provider === 'openrouter')) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.responseSchema.name || 'structured_output',
          description: options.responseSchema.description,
          schema: options.responseSchema.schema,
        },
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      let sanitizedErr = errText;
      if (apiKey) {
        sanitizedErr = sanitizedErr.split(apiKey).join('***HIDDEN_KEY***');
      }
      throw new Error(`LLM Request failed (${res.status}): ${sanitizedErr}`);
    }

    if (isStreaming && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';
      let tokensUsed: number | undefined = undefined;
      let promptTokens: number | undefined = undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            let json: unknown;
            try {
              json = JSON.parse(trimmed.slice(6));
            } catch {
              // ignore partial line JSON
              continue;
            }
            // The error check runs after and outside the parse try/catch:
            // a throw inside it would otherwise be swallowed by the catch.
            const streamError = openAIStreamErrorMessage(json);
            if (streamError !== null) {
              try {
                await reader.cancel();
              } catch {
                // ignore a failure of the cancel itself
              }
              throw new Error(scrubApiKey(`LLM stream error: ${streamError}`, apiKey));
            }
            const parsed = json as {
              choices?: { delta?: { content?: string } }[];
              usage?: { total_tokens?: number; prompt_tokens?: number };
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              options.onChunk!(delta);
            }
            if (parsed.usage) {
              if (typeof parsed.usage.total_tokens === 'number') {
                tokensUsed = parsed.usage.total_tokens;
              }
              if (typeof parsed.usage.prompt_tokens === 'number') {
                promptTokens = parsed.usage.prompt_tokens;
              }
            }
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          let json: unknown;
          try {
            json = JSON.parse(trimmed.slice(6));
          } catch {
            json = undefined;
          }
          if (json !== undefined) {
            const streamError = openAIStreamErrorMessage(json);
            if (streamError !== null) {
              try {
                await reader.cancel();
              } catch {
                // ignore a failure of the cancel itself
              }
              throw new Error(scrubApiKey(`LLM stream error: ${streamError}`, apiKey));
            }
            const parsed = json as {
              choices?: { delta?: { content?: string } }[];
              usage?: { total_tokens?: number; prompt_tokens?: number };
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              options.onChunk!(delta);
            }
            if (parsed.usage) {
              if (typeof parsed.usage.total_tokens === 'number') {
                tokensUsed = parsed.usage.total_tokens;
              }
              if (typeof parsed.usage.prompt_tokens === 'number') {
                promptTokens = parsed.usage.prompt_tokens;
              }
            }
          }
        }
      }

      return recordLLMResponseUsage(profile, options, { text: fullText, tokensUsed, promptTokens });
    } else {
      const data = await res.json();
      const providerError =
        typeof data === 'object' && data !== null
          ? openAIErrorFieldMessage(data as Record<string, unknown>)
          : null;
      if (providerError !== null) {
        throw new Error(scrubApiKey(`LLM provider returned an error: ${providerError}`, apiKey));
      }
      const text = data.choices?.[0]?.message?.content || '';
      const tokensUsed = data.usage?.total_tokens;
      const promptTokens = data.usage?.prompt_tokens;
      return recordLLMResponseUsage(profile, options, { text, tokensUsed, promptTokens });
    }
  }

  // 3. ANTHROPIC PROVIDER
  if (profile.provider === 'anthropic') {
    if (!apiKey) {
      throw new Error('Anthropic API key is required.');
    }

    const formattedMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const isStreaming = Boolean(options.onChunk);

    const requestBody: Record<string, unknown> = {
      model: profile.model || DEFAULT_ANTHROPIC_MODEL,
      system: systemPrompt || messages.find((m) => m.role === 'system')?.content,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature,
      ...(isStreaming ? { stream: true } : {}),
    };

    if (options.responseSchema) {
      requestBody.tools = [
        {
          name: options.responseSchema.name,
          description: options.responseSchema.description || 'Structured output response',
          input_schema: options.responseSchema.schema,
        },
      ];
      requestBody.tool_choice = {
        type: 'tool',
        name: options.responseSchema.name,
      };
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      let sanitizedErr = errText;
      if (apiKey) {
        sanitizedErr = sanitizedErr.split(apiKey).join('***HIDDEN_KEY***');
      }
      throw new Error(`Anthropic API failed (${res.status}): ${sanitizedErr}`);
    }

    if (isStreaming && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';
      let tokensUsed: number | undefined = undefined;
      let promptTokens: number | undefined = undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            let json: unknown;
            try {
              json = JSON.parse(trimmed.slice(6));
            } catch {
              // ignore partial line
              continue;
            }
            // The error check runs after and outside the parse try/catch:
            // a throw inside it would otherwise be swallowed by the catch.
            const streamError = anthropicStreamErrorMessage(json);
            if (streamError !== null) {
              try {
                await reader.cancel();
              } catch {
                // ignore a failure of the cancel itself
              }
              throw new Error(scrubApiKey(`LLM stream error: ${streamError}`, apiKey));
            }
            const parsed = json as {
              type?: string;
              message?: { usage?: { input_tokens?: number } };
              delta?: { text?: string; partial_json?: string };
              usage?: { output_tokens?: number };
            };
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              promptTokens = parsed.message.usage.input_tokens;
            } else if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta?.text || parsed.delta?.partial_json;
              if (delta) {
                fullText += delta;
                options.onChunk!(delta);
              }
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              const outputTokens = parsed.usage.output_tokens || 0;
              tokensUsed = (promptTokens || 0) + outputTokens;
            }
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          let json: unknown;
          try {
            json = JSON.parse(trimmed.slice(6));
          } catch {
            json = undefined;
          }
          if (json !== undefined) {
            const streamError = anthropicStreamErrorMessage(json);
            if (streamError !== null) {
              try {
                await reader.cancel();
              } catch {
                // ignore a failure of the cancel itself
              }
              throw new Error(scrubApiKey(`LLM stream error: ${streamError}`, apiKey));
            }
            const parsed = json as {
              type?: string;
              message?: { usage?: { input_tokens?: number } };
              delta?: { text?: string; partial_json?: string };
              usage?: { output_tokens?: number };
            };
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              promptTokens = parsed.message.usage.input_tokens;
            } else if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta?.text || parsed.delta?.partial_json;
              if (delta) {
                fullText += delta;
                options.onChunk!(delta);
              }
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              const outputTokens = parsed.usage.output_tokens || 0;
              tokensUsed = (promptTokens || 0) + outputTokens;
            }
          }
        }
      }

      return recordLLMResponseUsage(profile, options, { text: fullText, tokensUsed, promptTokens });
    } else {
      const data = await res.json();
      if (data?.type === 'error') {
        const providerError = anthropicStreamErrorMessage(data) ?? 'no message';
        throw new Error(scrubApiKey(`LLM provider returned an error: ${providerError}`, apiKey));
      }
      let text = '';
      const toolUseBlock = (data.content as Array<{ type?: string; input?: unknown }> | undefined)?.find(
        (c) => c.type === 'tool_use'
      );
      if (toolUseBlock && toolUseBlock.input) {
        text = typeof toolUseBlock.input === 'string' ? toolUseBlock.input : JSON.stringify(toolUseBlock.input);
      } else {
        text = data.content?.[0]?.text || '';
      }
      const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
      const promptTokens = data.usage?.input_tokens;
      return recordLLMResponseUsage(profile, options, { text, tokensUsed, promptTokens });
    }
  }

  throw new Error(`Unsupported provider: ${profile.provider}`);
}

/**
 * Direct client-side provider adapter with multi-profile fallback support.
 * Supports Gemini, OpenAI / OpenRouter / Ollama / custom, and Anthropic.
 */
export async function sendLLMRequest(
  profile: ConnectionProfile | ConnectionProfile[],
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const profiles = Array.isArray(profile) ? profile : [profile];
  if (profiles.length === 0) {
    throw new Error('No connection profile provided.');
  }

  const errors: Error[] = [];
  for (let i = 0; i < profiles.length; i++) {
    const prof = profiles[i];
    try {
      return await sendSingleLLMRequest(prof, options);
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      errors.push(errorObj);
      console.warn(
        `LLM request failed using profile "${prof.name || prof.provider}" (${i + 1}/${profiles.length}):`,
        errorObj.message
      );
    }
  }

  const errorMessages = errors.map((e, idx) => {
    const prof = profiles[idx];
    const profName = prof.name || prof.provider;
    return `[${profName}]: ${e.message}`;
  }).join('\n');
  throw new Error(`All LLM connection profiles failed:\n${errorMessages}`);
}

/**
 * Explicit helper for multi-profile fallback execution.
 */
export async function sendLLMRequestWithFallback(
  profiles: ConnectionProfile[],
  options: LLMRequestOptions
): Promise<LLMResponse> {
  return sendLLMRequest(profiles, options);
}

/**
 * Helper to execute LLM request with streaming callbacks.
 */
export async function streamLLMRequest(
  profile: ConnectionProfile | ConnectionProfile[],
  options: LLMRequestOptions,
  onChunk: (chunk: string) => void
): Promise<LLMResponse> {
  return sendLLMRequest(profile, { ...options, onChunk });
}
