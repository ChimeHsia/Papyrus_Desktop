import { randomUUID } from 'node:crypto';
import { getDb } from './core.js';
import type { PapyrusLogger } from '../utils/logger.js';

export interface ChatSessionRow {
  id: string;
  title: string;
  model: string;
  provider: string;
  is_active: number;
  message_count: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  blocks: string;
  attachments: string;
  model: string;
  provider: string;
  token_usage: string;
  parent_message_id: string | null;
  is_deleted: number;
  created_at: number;
}

interface CreateChatSessionInput {
  id?: string;
  title?: string;
  model?: string;
  provider?: string;
  created_at?: number;
  updated_at?: number;
}

export function createChatSession(input: CreateChatSessionInput = {}, logger?: PapyrusLogger): ChatSessionRow {
  const database = getDb();
  const now = Date.now() / 1000;
  const row: ChatSessionRow = {
    id: input.id ?? randomUUID(),
    title: input.title ?? '新对话',
    model: input.model ?? '',
    provider: input.provider ?? '',
    is_active: 0,
    message_count: 0,
    metadata: '{}',
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
  };
  const stmt = database.prepare(
    'INSERT INTO chat_sessions (id, title, model, provider, is_active, message_count, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(row.id, row.title, row.model, row.provider, row.is_active, row.message_count, row.metadata, row.created_at, row.updated_at);
  logger?.info(`创建会话: ${row.id}`);
  return row;
}

export function listChatSessions(): ChatSessionRow[] {
  const database = getDb();
  return database.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all() as unknown as ChatSessionRow[];
}

export function getChatSession(id: string): ChatSessionRow | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as ChatSessionRow | undefined;
  return row ?? null;
}

export interface ChatSessionPatch {
  title?: string;
  model?: string;
  provider?: string;
  metadata?: string;
  message_count?: number;
}

const ALLOWED_SESSION_COLUMNS = new Set(['title', 'model', 'provider', 'metadata', 'message_count']);
const ALLOWED_MESSAGE_COLUMNS = new Set(['content', 'blocks', 'attachments', 'model', 'provider', 'token_usage']);

export function updateChatSession(id: string, patch: ChatSessionPatch): boolean {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(id) as { id: string } | undefined;
  if (!existing) return false;
  const entries = Object.entries(patch).filter(([_, v]) => v !== undefined);
  if (entries.length === 0) return true;
  const invalid = entries.filter(([k]) => !ALLOWED_SESSION_COLUMNS.has(k));
  if (invalid.length) throw new Error(`Invalid session column(s): ${invalid.map(([k]) => k).join(', ')}`);
  const sets = entries.map(([k]) => `${k} = ?`);
  const values = entries.map(([_, v]) => v);
  sets.push('updated_at = ?');
  values.push(Date.now() / 1000);
  values.push(id);
  database.prepare(`UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

export function setActiveChatSession(id: string): boolean {
  const database = getDb();
  database.exec('UPDATE chat_sessions SET is_active = 0');
  const stmt = database.prepare('UPDATE chat_sessions SET is_active = 1, updated_at = ? WHERE id = ?');
  const result = stmt.run(Date.now() / 1000, id);
  return result.changes > 0;
}

export function getActiveChatSession(): ChatSessionRow | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM chat_sessions WHERE is_active = 1 LIMIT 1').get() as ChatSessionRow | undefined;
  return row ?? null;
}

export function deleteChatSession(id: string, logger?: PapyrusLogger): { deleted: boolean; newActiveId: string | null } {
  const database = getDb();
  const wasActive = database.prepare('SELECT is_active FROM chat_sessions WHERE id = ?').get(id) as { is_active: number } | undefined;
  if (!wasActive) return { deleted: false, newActiveId: null };
  database.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  let newActiveId: string | null = null;
  if (wasActive.is_active) {
    const next = database.prepare('SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT 1').get() as { id: string } | undefined;
    if (next) {
      setActiveChatSession(next.id);
      newActiveId = next.id;
    }
  }
  logger?.info(`删除会话: ${id}`);
  return { deleted: true, newActiveId };
}

export function clearAllChatSessions(logger?: PapyrusLogger): number {
  const database = getDb();
  const count = (database.prepare('SELECT COUNT(*) as c FROM chat_sessions').get() as { c: number }).c;
  database.exec('DELETE FROM chat_sessions');
  database.exec('DELETE FROM chat_messages');
  logger?.info(`清空所有会话: ${count} 条`);
  return count;
}

export function touchChatSession(id: string, ts?: number): void {
  const database = getDb();
  database.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(ts ?? Date.now() / 1000, id);
}

// ===== Chat Messages =====

export interface AppendChatMessageInput {
  id?: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  blocks?: string;
  attachments?: string;
  model?: string;
  provider?: string;
  token_usage?: string;
  parent_message_id?: string | null;
  created_at?: number;
}

export function appendChatMessage(input: AppendChatMessageInput, logger?: PapyrusLogger): ChatMessageRow {
  const database = getDb();
  const now = Date.now() / 1000;
  const row: ChatMessageRow = {
    id: input.id ?? randomUUID(),
    session_id: input.session_id,
    role: input.role,
    content: input.content ?? '',
    blocks: input.blocks ?? '',
    attachments: input.attachments ?? '[]',
    model: input.model ?? '',
    provider: input.provider ?? '',
    token_usage: input.token_usage ?? '{}',
    parent_message_id: input.parent_message_id ?? null,
    is_deleted: 0,
    created_at: input.created_at ?? now,
  };
  const stmt = database.prepare(
    'INSERT INTO chat_messages (id, session_id, role, content, blocks, attachments, model, provider, token_usage, parent_message_id, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(row.id, row.session_id, row.role, row.content, row.blocks, row.attachments, row.model, row.provider, row.token_usage, row.parent_message_id, row.is_deleted, row.created_at);
  const count = (database.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE session_id = ?').get(row.session_id) as { c: number }).c;
  database.prepare('UPDATE chat_sessions SET message_count = ?, updated_at = ? WHERE id = ?').run(count, now, row.session_id);
  logger?.info(`添加消息: ${row.id} (会话 ${row.session_id})`);
  return row;
}

export function listChatMessages(sessionId: string, opts?: { includeDeleted?: boolean }): ChatMessageRow[] {
  const database = getDb();
  if (opts?.includeDeleted) {
    return database.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at').all(sessionId) as unknown as ChatMessageRow[];
  }
  return database.prepare('SELECT * FROM chat_messages WHERE session_id = ? AND is_deleted = 0 ORDER BY created_at').all(sessionId) as unknown as ChatMessageRow[];
}

export function getChatMessage(id: string): ChatMessageRow | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as ChatMessageRow | undefined;
  return row ?? null;
}

export interface ChatMessagePatch {
  content?: string;
  blocks?: string;
  attachments?: string;
  model?: string;
  provider?: string;
  token_usage?: string;
}

export function updateChatMessage(id: string, patch: ChatMessagePatch): boolean {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM chat_messages WHERE id = ?').get(id) as { id: string } | undefined;
  if (!existing) return false;
  const entries = Object.entries(patch).filter(([_, v]) => v !== undefined);
  if (entries.length === 0) return true;
  const invalid = entries.filter(([k]) => !ALLOWED_MESSAGE_COLUMNS.has(k));
  if (invalid.length) throw new Error(`Invalid message column(s): ${invalid.map(([k]) => k).join(', ')}`);
  const sets = entries.map(([k]) => `${k} = ?`);
  const values = entries.map(([_, v]) => v);
  values.push(id);
  database.prepare(`UPDATE chat_messages SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

export function softDeleteChatMessage(id: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('UPDATE chat_messages SET is_deleted = 1 WHERE id = ?');
  const result = stmt.run(id);
  logger?.info(`软删除消息: ${id}`);
  return result.changes > 0;
}

export function deleteMessagesAfter(sessionId: string, fromCreatedAt: number, logger?: PapyrusLogger): number {
  const database = getDb();
  const result = database.prepare('DELETE FROM chat_messages WHERE session_id = ? AND created_at >= ?').run(sessionId, fromCreatedAt);
  const changed = Number(result.changes);
  if (changed > 0) {
    database.prepare(
      'UPDATE chat_sessions SET message_count = (SELECT COUNT(*) FROM chat_messages WHERE session_id = ? AND is_deleted = 0), updated_at = ? WHERE id = ?'
    ).run(sessionId, Date.now() / 1000, sessionId);
    logger?.info(`删除会话 ${sessionId} 中 ${changed} 条消息`);
  }
  return changed;
}

export function getChatMessageCount(sessionId: string, opts?: { includeDeleted?: boolean }): number {
  const database = getDb();
  if (opts?.includeDeleted) {
    return (database.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE session_id = ?').get(sessionId) as { c: number }).c;
  }
  return (database.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE session_id = ? AND is_deleted = 0').get(sessionId) as { c: number }).c;
}
