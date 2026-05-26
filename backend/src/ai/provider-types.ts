import OpenAI from 'openai';
import type { Fetch } from 'openai/core';

export type StreamEventType =
  | 'content'
  | 'reasoning'
  | 'tool_start'
  | 'tool_result'
  | 'done'
  | 'error'
  | 'user_saved'
  | 'stream_end';

export interface StreamChunk {
  type: StreamEventType;
  data: string | Record<string, unknown>;
}

export function isStreamChunkDataString(chunk: StreamChunk): chunk is StreamChunk & { data: string } {
  return typeof chunk.data === 'string';
}

export type ReasoningEffort = 'low' | 'medium' | 'high';
export type ReasoningKind = false | 'reasoning_effort' | 'thinking' | 'thinking_config';
export type ProviderModality = 'openai-compat' | 'ollama' | 'text-only';

export interface AttachmentMeta {
  id: string;
  name: string;
  stored_name: string;
  path: string;
  type: 'image' | 'document';
  mime_type: string;
  size: number;
  createdAt: number;
}

export function getProviderModality(providerName: string): ProviderModality {
  if (providerName === 'ollama') return 'ollama';
  const compat = new Set([
    'openai', 'anthropic', 'gemini', 'deepseek', 'moonshot',
    'liyuan-deepseek', 'siliconflow', 'custom',
  ]);
  if (compat.has(providerName)) return 'openai-compat';
  return 'text-only';
}

export function modelSupportsReasoning(providerName: string, model: string): ReasoningKind {
  const lower = model.toLowerCase();
  if (['openai', 'deepseek', 'moonshot', 'liyuan-deepseek', 'siliconflow'].includes(providerName)) {
    if (/^o[1-9]|^gpt-5|r1|reasoner|thinking/i.test(lower)) return 'reasoning_effort';
    return false;
  }
  if (providerName === 'anthropic') {
    if (/claude-(opus|sonnet)-[4-9]|claude-mythos/i.test(lower)) return 'thinking';
    return false;
  }
  if (providerName === 'gemini') {
    if (/gemini-[2-9]\.\d|gemini-[3-9]/i.test(lower)) return 'thinking_config';
    return false;
  }
  return false;
}

export function normalizeReasoning(reasoning: unknown): ReasoningEffort | false {
  if (typeof reasoning === 'boolean') return reasoning ? 'medium' : false;
  if (typeof reasoning === 'string') {
    const s = reasoning.trim().toLowerCase();
    if (s === 'low' || s === 'medium' || s === 'high') return s;
    if (s === 'true') return 'medium';
    return false;
  }
  return false;
}

type OpenAIFetchParam = NonNullable<
  NonNullable<ConstructorParameters<typeof OpenAI>[0]>['fetch']
>;

export type { OpenAIFetchParam };

export const REASONING_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
};

type RequestParamsWithReasoning = OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
  thinking?: { type: 'enabled'; budget_tokens: number };
  thinking_config?: { thinking_budget: number };
};

export type { RequestParamsWithReasoning };
