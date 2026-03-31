import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { Hono } from 'hono';
import { emitEvent } from '../events.js';
import { registry } from '../pluginManager.js';

const BACKUP_VERSION = '1';
const XON_VERSION = '0.0.1';

interface BackupInfo {
  version: string;
  xonVersion: string;
  createdAt: string;
}

// ─── Minimal ZIP builder ──────────────────────────────────────────────────────

let _crc32Table: Uint32Array | null = null;

function makeCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  _crc32Table = table;
  return table;
}

function crc32(data: Buffer): number {
  const table = makeCrc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.data);
    const checksum = crc32(file.data);

    // Local file header (30 bytes + filename)
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: DEFLATE
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    nameBytes.copy(local, 30);

    // Central directory entry (46 bytes + filename)
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method: DEFLATE
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // offset of local header
    nameBytes.copy(central, 46);

    parts.push(local, compressed);
    centralEntries.push(central);
    offset += 30 + nameBytes.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centralEntries);
  const cdStart = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with CD start
  eocd.writeUInt16LE(files.length, 8); // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(cdBuf.length, 12); // CD size
  eocd.writeUInt32LE(cdStart, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...parts, cdBuf, eocd]);
}

// ─── Minimal ZIP parser ───────────────────────────────────────────────────────

function parseZip(buf: Buffer): Map<string, Buffer> {
  const result = new Map<string, Buffer>();

  // Locate End of Central Directory record by scanning backwards
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error('Invalid ZIP: EOCD signature not found');

  const totalEntries = buf.readUInt16LE(eocdPos + 10);
  const cdOffset = buf.readUInt32LE(eocdPos + 16);

  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);

    // Navigate to local file header to find data start
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;

    const compressed = buf.subarray(dataStart, dataStart + compressedSize);
    const data =
      method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);

    result.set(name, data);
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDbPath(): string {
  const dataDir = process.env.DATA_DIR ?? './data';
  return join(dataDir, 'xon.db');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function makeAdminBackupRouter(_db: LibSQLDatabase): Hono {
  const router = new Hono();

  /**
   * POST /admin/backup/metadata
   * Exports the SQLite database, plugin list, and server config as a ZIP archive.
   * Progress is reported via WebSocket events.
   */
  router.post('/', async (c) => {
    try {
      emitEvent({
        type: 'backup:progress',
        payload: { stage: 'starting', percent: 0 },
      });

      // 1. Build backup metadata
      const backupInfo: BackupInfo = {
        version: BACKUP_VERSION,
        xonVersion: XON_VERSION,
        createdAt: new Date().toISOString(),
      };
      emitEvent({
        type: 'backup:progress',
        payload: { stage: 'metadata', percent: 20 },
      });

      // 2. Read the SQLite database file
      let dbData: Buffer;
      try {
        dbData = await readFile(getDbPath());
      } catch {
        // In-memory or test databases have no file — include empty placeholder
        dbData = Buffer.alloc(0);
      }
      emitEvent({
        type: 'backup:progress',
        payload: { stage: 'database', percent: 60 },
      });

      // 3. Collect plugin list and statuses
      const pluginList = [...registry.entries()].map(([id, entry]) => ({
        id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        category: entry.manifest.category,
        status: entry.status,
      }));

      // 4. Server config (non-sensitive env values)
      const serverConfig = {
        dataDir: process.env.DATA_DIR ?? './data',
        port: process.env.PORT ?? '32400',
      };

      emitEvent({
        type: 'backup:progress',
        payload: { stage: 'packaging', percent: 80 },
      });

      const zipBuf = buildZip([
        {
          name: 'backup-info.json',
          data: Buffer.from(JSON.stringify(backupInfo, null, 2)),
        },
        { name: 'xon.db', data: dbData },
        {
          name: 'plugins.json',
          data: Buffer.from(JSON.stringify(pluginList, null, 2)),
        },
        {
          name: 'server-config.json',
          data: Buffer.from(JSON.stringify(serverConfig, null, 2)),
        },
      ]);

      emitEvent({
        type: 'backup:complete',
        payload: { sizeBytes: zipBuf.length },
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return c.body(new Uint8Array(zipBuf), 200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="xon-backup-${timestamp}.zip"`,
        'Content-Length': String(zipBuf.length),
      });
    } catch (err) {
      emitEvent({ type: 'backup:error', payload: { error: String(err) } });
      return c.json({ error: 'Backup failed' }, 500);
    }
  });

  return router;
}

export function makeAdminRestoreRouter(_db: LibSQLDatabase): Hono {
  const router = new Hono();

  /**
   * POST /admin/restore/metadata
   * Accepts a ZIP backup archive and restores the database.
   * Validates version compatibility before applying.
   */
  router.post('/', async (c) => {
    try {
      emitEvent({
        type: 'restore:progress',
        payload: { stage: 'receiving', percent: 0 },
      });

      const arrayBuffer = await c.req.arrayBuffer();
      const zipBuf = Buffer.from(arrayBuffer);

      if (zipBuf.length === 0) {
        return c.json({ error: 'No backup data received' }, 400);
      }

      emitEvent({
        type: 'restore:progress',
        payload: { stage: 'parsing', percent: 20 },
      });

      let files: Map<string, Buffer>;
      try {
        files = parseZip(zipBuf);
      } catch {
        return c.json({ error: 'Invalid ZIP file' }, 400);
      }

      // Validate backup-info.json
      const infoData = files.get('backup-info.json');
      if (!infoData) {
        return c.json(
          { error: 'Invalid backup: missing backup-info.json' },
          400,
        );
      }

      let backupInfo: BackupInfo;
      try {
        backupInfo = JSON.parse(infoData.toString('utf8')) as BackupInfo;
      } catch {
        return c.json(
          { error: 'Invalid backup: corrupt backup-info.json' },
          400,
        );
      }

      if (backupInfo.version !== BACKUP_VERSION) {
        return c.json(
          {
            error: `Incompatible backup version: got ${backupInfo.version}, expected ${BACKUP_VERSION}`,
          },
          400,
        );
      }

      emitEvent({
        type: 'restore:progress',
        payload: { stage: 'restoring', percent: 50 },
      });

      // Restore database file (skip if empty — in-memory / test scenario)
      const dbData = files.get('xon.db');
      if (dbData && dbData.length > 0) {
        await writeFile(getDbPath(), dbData);
      }

      emitEvent({
        type: 'restore:complete',
        payload: { restoredAt: new Date().toISOString() },
      });

      return c.json({
        success: true,
        restoredFrom: backupInfo.createdAt,
        xonVersion: backupInfo.xonVersion,
      });
    } catch (err) {
      emitEvent({ type: 'restore:error', payload: { error: String(err) } });
      return c.json({ error: 'Restore failed' }, 500);
    }
  });

  return router;
}
