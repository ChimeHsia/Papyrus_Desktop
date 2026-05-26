import { getDb, tagsFromJson } from './core.js';
import type { CardRecord } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';

export function loadAllCards(logger?: PapyrusLogger): CardRecord[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM cards').all() as unknown as CardRecord[];
  logger?.info(`查询卡片: ${rows.length} 条`);
  return rows.map(r => ({ ...r, tags: tagsFromJson(r.tags as unknown as string) }));
}

export function saveAllCards(cards: CardRecord[], logger?: PapyrusLogger): void {
  const database = getDb();
  const deleteStmt = database.prepare('DELETE FROM cards');
  const insertStmt = database.prepare(
    'INSERT INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  deleteStmt.run();
  for (const card of cards) {
    insertStmt.run(card.id, card.q, card.a, card.next_review, card.interval, card.ef, card.repetitions, JSON.stringify(card.tags));
  }
  logger?.info(`保存卡片: ${cards.length} 条`);
}

export function insertCard(card: CardRecord, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(card.id, card.q, card.a, card.next_review ?? 0, card.interval ?? 0, card.ef ?? 2.5, card.repetitions ?? 0, JSON.stringify(card.tags ?? []));
  logger?.info(`插入卡片: ${card.id}`);
}

export function deleteCardById(cardId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM cards WHERE id = ?');
  const result = stmt.run(cardId);
  logger?.info(`删除卡片: ${cardId}`);
  return result.changes > 0;
}

export function deleteCardsByIds(cardIds: string[], logger?: PapyrusLogger): number {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM cards WHERE id = ?');
  let count = 0;
  for (const id of cardIds) {
    const result = stmt.run(id);
    count += Number(result.changes);
  }
  logger?.info(`批量删除卡片: ${count} 条`);
  return count;
}

export function getCardById(cardId: string): CardRecord | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRecord | undefined;
  if (!row) return null;
  return { ...row, tags: tagsFromJson(row.tags as unknown as string) };
}

export function updateCard(card: CardRecord, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM cards WHERE id = ?').get(card.id) as { id: string } | undefined;
  if (!existing) {
    logger?.warning(`卡片不存在: ${card.id}`);
    return false;
  }
  const stmt = database.prepare(
    'UPDATE cards SET q = ?, a = ?, next_review = ?, interval = ?, ef = ?, repetitions = ?, tags = ? WHERE id = ?'
  );
  stmt.run(card.q, card.a, card.next_review, card.interval, card.ef, card.repetitions, JSON.stringify(card.tags), card.id);
  logger?.info(`更新卡片: ${card.id}`);
  return true;
}

export function getCardsDueBefore(timestamp: number): CardRecord[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM cards WHERE next_review <= ? ORDER BY next_review').all(timestamp) as unknown as CardRecord[];
  return rows.map(r => ({ ...r, tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags }));
}

export function getCardCount(): number {
  const database = getDb();
  const result = database.prepare('SELECT COUNT(*) as c FROM cards').get() as { c: number };
  return result.c;
}
