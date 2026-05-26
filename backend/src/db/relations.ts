import { getDb, jsonFromStr } from './core.js';
import type { Note } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';

interface RelationRecord {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export function loadRelationsForNote(noteId: string): {
  outgoing: Array<{
    id: string; source_id: string; target_id: string; relation_type: string;
    description: string; created_at: number; updated_at: number;
    title: string; folder: string;
  }>;
  incoming: Array<{
    id: string; source_id: string; target_id: string; relation_type: string;
    description: string; created_at: number; updated_at: number;
    title: string; folder: string;
  }>;
} {
  const database = getDb();
  const outgoing = database.prepare(
    'SELECT r.*, n.title, n.folder FROM relations r JOIN notes n ON r.target_id = n.id WHERE r.source_id = ?'
  ).all(noteId) as any[];
  const incoming = database.prepare(
    'SELECT r.*, n.title, n.folder FROM relations r JOIN notes n ON r.source_id = n.id WHERE r.target_id = ?'
  ).all(noteId) as any[];
  return { outgoing, incoming };
}

export function insertRelation(relation: RelationRecord, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO relations (id, source_id, target_id, relation_type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const now = Date.now() / 1000;
  stmt.run(relation.id, relation.source_id, relation.target_id, relation.relation_type ?? 'reference', relation.description ?? '', relation.created_at ?? now, relation.updated_at ?? now);
  logger?.info(`插入关联: ${relation.id}`);
}

export function updateRelation(relationId: string, updates: Partial<Pick<RelationRecord, 'relation_type' | 'description'>>, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM relations WHERE id = ?').get(relationId) as { id: string } | undefined;
  if (!existing) {
    logger?.warning(`关联不存在: ${relationId}`);
    return false;
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.relation_type !== undefined) { sets.push('relation_type = ?'); values.push(updates.relation_type); }
  if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
  if (sets.length === 0) return true;
  sets.push('updated_at = ?');
  values.push(Date.now() / 1000);
  values.push(relationId);
  database.prepare(`UPDATE relations SET ${sets.join(', ')} WHERE id = ?`).run(...values as import('node:sqlite').SQLInputValue[]);
  logger?.info(`更新关联: ${relationId}`);
  return true;
}

export function deleteRelationById(relationId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM relations WHERE id = ?');
  const result = stmt.run(relationId);
  logger?.info(`删除关联: ${relationId}`);
  return result.changes > 0;
}

export function searchNotesForRelation(query: string, excludeNoteId: string, limit: number): Note[] {
  const database = getDb();
  const rows = database.prepare(
    'SELECT * FROM notes WHERE id != ? AND (title LIKE ? OR content LIKE ?) LIMIT ?'
  ).all(excludeNoteId, `%${query}%`, `%${query}%`, limit) as unknown as Note[];
  return rows.map(r => ({ ...r, tags: jsonFromStr(r.tags as unknown as string) as string[] }));
}

export function getGraphData(noteId: string, depth: number): {
  nodes: Array<{ id: string; title: string; folder: string; is_center: boolean }>;
  links: Array<{ source: string; target: string; type: string }>;
} {
  const database = getDb();
  const nodeSet = new Map<string, { id: string; title: string; folder: string; is_center: boolean }>();
  const linkSet = new Set<string>();
  const links: Array<{ source: string; target: string; type: string }> = [];

  function addNode(id: string, title: string, folder: string, isCenter: boolean) {
    if (!nodeSet.has(id)) {
      nodeSet.set(id, { id, title, folder, is_center: isCenter });
    }
  }

  function addLink(source: string, target: string, type: string) {
    const key = `${source}-${target}-${type}`;
    if (!linkSet.has(key)) {
      linkSet.add(key);
      links.push({ source, target, type });
    }
  }

  const centerRow = database.prepare('SELECT id, title, folder FROM notes WHERE id = ?').get(noteId) as { id: string; title: string; folder: string } | undefined;
  if (centerRow) {
    addNode(centerRow.id, centerRow.title, centerRow.folder, true);
  }

  let currentDepth = 0;
  let currentIds = [noteId];

  while (currentDepth < depth && currentIds.length > 0) {
    const nextIds: string[] = [];
    const placeholders = currentIds.map(() => '?').join(',');

    const outgoingRows = database.prepare(
      `SELECT r.source_id, r.target_id, r.relation_type, n.title as target_title, n.folder as target_folder
       FROM relations r JOIN notes n ON r.target_id = n.id
       WHERE r.source_id IN (${placeholders})`
    ).all(...currentIds) as Array<{ source_id: string; target_id: string; relation_type: string; target_title: string; target_folder: string }>;
    for (const row of outgoingRows) {
      addNode(row.target_id, row.target_title, row.target_folder, false);
      addLink(row.source_id, row.target_id, row.relation_type);
      if (currentDepth + 1 < depth) {
        nextIds.push(row.target_id);
      }
    }

    const incomingRows = database.prepare(
      `SELECT r.source_id, r.target_id, r.relation_type, n.title as source_title, n.folder as source_folder
       FROM relations r JOIN notes n ON r.source_id = n.id
       WHERE r.target_id IN (${placeholders})`
    ).all(...currentIds) as Array<{ source_id: string; target_id: string; relation_type: string; source_title: string; source_folder: string }>;
    for (const row of incomingRows) {
      addNode(row.source_id, row.source_title, row.source_folder, false);
      addLink(row.source_id, row.target_id, row.relation_type);
      if (currentDepth + 1 < depth) {
        nextIds.push(row.source_id);
      }
    }

    currentDepth++;
    currentIds = [...new Set(nextIds)];
  }

  return { nodes: Array.from(nodeSet.values()), links };
}
