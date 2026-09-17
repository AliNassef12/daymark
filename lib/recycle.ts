export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// R2 deletion precedes row removal so a failed file cleanup can be retried.
export async function purgeItem(database: D1Database, files: R2Bucket, table: 'lists'|'tasks'|'notes', id: string, owner: string) {
  const row = await database.prepare(`SELECT * FROM ${table} WHERE id=? AND owner=? AND deleted_at IS NOT NULL`).bind(id, owner).first<{file_key?:string}>();
  if (!row) return;
  if (table === 'notes' && row.file_key) await files.delete(row.file_key);
  const statements: D1PreparedStatement[] = [];
  if (table === 'lists') statements.push(database.prepare('DELETE FROM tasks WHERE list_id=? AND owner=?').bind(id, owner));
  statements.push(database.prepare(`DELETE FROM ${table} WHERE id=? AND owner=? AND deleted_at IS NOT NULL`).bind(id, owner));
  await database.batch(statements);
}

export async function purgeExpired(database: D1Database, files: R2Bucket, now = Date.now()) {
  for (const table of ['lists','tasks','notes'] as const) {
    const rows = await database.prepare(`SELECT id,owner FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at<=? LIMIT 100`).bind(now - RETENTION_MS).all<{id:string;owner:string}>();
    for (const row of rows.results) await purgeItem(database, files, table, row.id, row.owner);
  }
}
