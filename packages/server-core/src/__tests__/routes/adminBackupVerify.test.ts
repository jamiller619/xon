import { readFile } from 'node:fs/promises';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { openDatabase } from '../../db.js';
import { migrateDatabase } from '../../migrate.js';
import { hashPassword } from '../../password.js';
import {
  backupFileState,
  backupTargets,
  backupVerifyJobs,
  users,
} from '../../schema.js';
import { computeChecksum } from '../../routes/adminBackupVerify.js';
import { signAccessToken } from '../../routes/auth.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const ADMIN_AUTH = `Bearer ${await signAccessToken('admin-1', 'admin', 'admin')}`;
const USER_AUTH = `Bearer ${await signAccessToken('user-1', 'user', 'user')}`;

describe('Admin Backup Verify API', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let targetId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);

    vi.mocked(readFile).mockResolvedValue(Buffer.from('file-content'));

    await db.insert(users).values({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: await hashPassword('pass'),
      role: 'admin',
    });
    await db.insert(users).values({
      id: 'user-1',
      username: 'user',
      email: 'user@example.com',
      displayName: 'User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
    });

    targetId = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id: targetId,
      name: 'Local Target',
      type: 'local',
      config: JSON.stringify({ destPath: '/backups/media' }),
      enabled: true,
      createdAt: new Date(),
    });
  });

  afterEach(() => {
    client.close();
    vi.clearAllMocks();
  });

  // ─── POST /admin/backup/verify/:targetId ─────────────────────────────────────

  describe('POST /api/v1/admin/backup/verify/:targetId', () => {
    it('returns 202 and creates a verify job for admin', async () => {
      const res = await app.request(`/api/v1/admin/backup/verify/${targetId}`, {
        method: 'POST',
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body).toHaveProperty('jobId');
      expect(body.status).toBe('running');
    });

    it('returns 404 for unknown target', async () => {
      const res = await app.request(
        '/api/v1/admin/backup/verify/nonexistent-id',
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 for disabled target', async () => {
      await db
        .update(backupTargets)
        .set({ enabled: false })
        .where(
          (await import('drizzle-orm').then((m) => m.eq))(
            backupTargets.id,
            targetId,
          ),
        );
      const res = await app.request(`/api/v1/admin/backup/verify/${targetId}`, {
        method: 'POST',
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await app.request(`/api/v1/admin/backup/verify/${targetId}`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const res = await app.request(`/api/v1/admin/backup/verify/${targetId}`, {
        method: 'POST',
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── GET /admin/backup/verify/jobs ───────────────────────────────────────────

  describe('GET /api/v1/admin/backup/verify/jobs', () => {
    it('returns empty list initially', async () => {
      const res = await app.request('/api/v1/admin/backup/verify/jobs', {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it('returns list after verify job created', async () => {
      await app.request(`/api/v1/admin/backup/verify/${targetId}`, {
        method: 'POST',
        headers: { Authorization: ADMIN_AUTH },
      });
      // Wait for async job to settle
      await new Promise((r) => setTimeout(r, 50));

      const res = await app.request('/api/v1/admin/backup/verify/jobs', {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  // ─── GET /admin/backup/verify/jobs/:id ───────────────────────────────────────

  describe('GET /api/v1/admin/backup/verify/jobs/:id', () => {
    it('returns 404 for unknown job id', async () => {
      const res = await app.request(
        '/api/v1/admin/backup/verify/jobs/no-such-id',
        {
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      expect(res.status).toBe(404);
    });

    it('returns job record by id', async () => {
      const createRes = await app.request(
        `/api/v1/admin/backup/verify/${targetId}`,
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      const { jobId } = await createRes.json();
      await new Promise((r) => setTimeout(r, 50));

      const res = await app.request(
        `/api/v1/admin/backup/verify/jobs/${jobId}`,
        {
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(jobId);
    });
  });

  // ─── runVerifyJob — unit-level integration tests ─────────────────────────────

  describe('runVerifyJob', () => {
    it('marks job completed with all passed when checksums match', async () => {
      const fileContent = Buffer.from('test-file-content');
      vi.mocked(readFile).mockResolvedValue(fileContent);

      const stateId = crypto.randomUUID();
      await db.insert(backupFileState).values({
        id: stateId,
        targetId,
        filePath: '/media/file.mp4',
        fileSize: fileContent.length,
        mtime: Date.now(),
        backedUpAt: new Date(),
      });

      const createRes = await app.request(
        `/api/v1/admin/backup/verify/${targetId}`,
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      const { jobId } = await createRes.json();
      await new Promise((r) => setTimeout(r, 100));

      const jobRows = await db
        .select()
        .from(backupVerifyJobs)
        .where(
          (await import('drizzle-orm').then((m) => m.eq))(
            backupVerifyJobs.id,
            jobId,
          ),
        );
      const job = jobRows[0];
      expect(job?.status).toBe('completed');
      expect(job?.totalFiles).toBe(1);
      expect(job?.passedFiles).toBe(1);
      expect(job?.failedFiles).toBe(0);
      expect(job?.missingFiles).toBe(0);
    });

    it('counts mismatched checksums as failed and flags for re-backup', async () => {
      const stateId = crypto.randomUUID();
      await db.insert(backupFileState).values({
        id: stateId,
        targetId,
        filePath: '/media/file.mp4',
        fileSize: 100,
        mtime: Date.now(),
        backedUpAt: new Date(),
      });

      // Return different content for source vs destination
      vi.mocked(readFile)
        .mockResolvedValueOnce(Buffer.from('source-content'))
        .mockResolvedValueOnce(Buffer.from('different-dest-content'));

      const createRes = await app.request(
        `/api/v1/admin/backup/verify/${targetId}`,
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      const { jobId } = await createRes.json();
      await new Promise((r) => setTimeout(r, 100));

      const jobRows = await db
        .select()
        .from(backupVerifyJobs)
        .where(
          (await import('drizzle-orm').then((m) => m.eq))(
            backupVerifyJobs.id,
            jobId,
          ),
        );
      const job = jobRows[0];
      expect(job?.status).toBe('completed');
      expect(job?.failedFiles).toBe(1);
      expect(job?.passedFiles).toBe(0);

      const failedItems = JSON.parse(job?.failedItems ?? '[]') as {
        filePath: string;
        reason: string;
      }[];
      expect(failedItems[0]?.filePath).toBe('/media/file.mp4');
      expect(failedItems[0]?.reason).toBe('Checksum mismatch');

      // State should be reset for re-backup
      const { eq } = await import('drizzle-orm');
      const stateRows = await db
        .select()
        .from(backupFileState)
        .where(eq(backupFileState.id, stateId));
      expect(stateRows[0]?.mtime).toBe(0);
      expect(stateRows[0]?.fileSize).toBe(0);
    });

    it('counts missing destination files as missing and flags for re-backup', async () => {
      const stateId = crypto.randomUUID();
      await db.insert(backupFileState).values({
        id: stateId,
        targetId,
        filePath: '/media/missing.mp4',
        fileSize: 100,
        mtime: Date.now(),
        backedUpAt: new Date(),
      });

      // Source reads fine, destination throws
      vi.mocked(readFile)
        .mockResolvedValueOnce(Buffer.from('source-content'))
        .mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      const createRes = await app.request(
        `/api/v1/admin/backup/verify/${targetId}`,
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      const { jobId } = await createRes.json();
      await new Promise((r) => setTimeout(r, 100));

      const { eq } = await import('drizzle-orm');
      const jobRows = await db
        .select()
        .from(backupVerifyJobs)
        .where(eq(backupVerifyJobs.id, jobId));
      const job = jobRows[0];
      expect(job?.missingFiles).toBe(1);
      expect(job?.failedFiles).toBe(0);

      const failedItems = JSON.parse(job?.failedItems ?? '[]') as {
        filePath: string;
        reason: string;
      }[];
      expect(failedItems[0]?.reason).toBe('Destination file missing');
    });

    it('handles empty state (no backed-up files)', async () => {
      const createRes = await app.request(
        `/api/v1/admin/backup/verify/${targetId}`,
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      const { jobId } = await createRes.json();
      await new Promise((r) => setTimeout(r, 100));

      const { eq } = await import('drizzle-orm');
      const jobRows = await db
        .select()
        .from(backupVerifyJobs)
        .where(eq(backupVerifyJobs.id, jobId));
      const job = jobRows[0];
      expect(job?.status).toBe('completed');
      expect(job?.totalFiles).toBe(0);
      expect(job?.passedFiles).toBe(0);
    });

    it('stores verified checksum in backupFileState for passing files', async () => {
      const { createHash } = await import('node:crypto');
      const fileContent = Buffer.from('consistent-content');
      const expectedChecksum = createHash('sha256')
        .update(fileContent)
        .digest('hex');

      vi.mocked(readFile).mockResolvedValue(fileContent);

      const stateId = crypto.randomUUID();
      await db.insert(backupFileState).values({
        id: stateId,
        targetId,
        filePath: '/media/ok.mp4',
        fileSize: fileContent.length,
        mtime: Date.now(),
        backedUpAt: new Date(),
      });

      const createRes = await app.request(
        `/api/v1/admin/backup/verify/${targetId}`,
        {
          method: 'POST',
          headers: { Authorization: ADMIN_AUTH },
        },
      );
      const { jobId } = await createRes.json();
      await new Promise((r) => setTimeout(r, 100));

      const { eq } = await import('drizzle-orm');
      const stateRows = await db
        .select()
        .from(backupFileState)
        .where(eq(backupFileState.id, stateId));
      expect(stateRows[0]?.checksum).toBe(expectedChecksum);
    });
  });

  // ─── computeChecksum unit test ────────────────────────────────────────────────

  describe('computeChecksum', () => {
    it('returns SHA-256 hex of file content', async () => {
      const { createHash } = await import('node:crypto');
      const content = Buffer.from('hello world');
      vi.mocked(readFile).mockResolvedValue(content);
      const result = await computeChecksum('/some/file.txt');
      const expected = createHash('sha256').update(content).digest('hex');
      expect(result).toBe(expected);
    });
  });
});
