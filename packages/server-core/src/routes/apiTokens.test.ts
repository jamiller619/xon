import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { openDatabase } from '../db.js';
import { migrateDatabase } from '../migrate.js';
import { hashPassword } from '../password.js';
import { signAccessToken } from '../routes/auth.js';
import { apiTokens, users } from '../schema.js';

const AUTH = `Bearer ${await signAccessToken('user-1', 'testuser', 'user')}`;

describe('API Tokens', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);

    await db.insert(users).values({
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
    });
  });

  afterEach(() => {
    client.close();
  });

  describe('POST /api/v1/users/me/tokens', () => {
    it('creates a token and returns it once', async () => {
      const res = await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My CLI token' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('My CLI token');
      expect(body.token).toMatch(/^xon_[0-9a-f]{64}$/);
      expect(body.expiresAt).toBeNull();
    });

    it('creates a token with expiry', async () => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const res = await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Expiring token', expiresAt }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.expiresAt).toBe(expiresAt);
    });

    it('returns 400 for missing name', async () => {
      const res = await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/users/me/tokens', () => {
    it('lists tokens without revealing token values', async () => {
      // Create two tokens
      await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Token A' }),
      });
      await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Token B' }),
      });

      const res = await app.request('/api/v1/users/me/tokens', {
        headers: { Authorization: AUTH },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      // Should NOT have token value or hash
      for (const t of body) {
        expect(t.token).toBeUndefined();
        expect(t.tokenHash).toBeUndefined();
        expect(t.name).toBeDefined();
        expect(t.id).toBeDefined();
      }
    });
  });

  describe('DELETE /api/v1/users/me/tokens/:id', () => {
    it('revokes a token by id', async () => {
      const createRes = await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'To revoke' }),
      });
      const { id } = await createRes.json();

      const deleteRes = await app.request(`/api/v1/users/me/tokens/${id}`, {
        method: 'DELETE',
        headers: { Authorization: AUTH },
      });
      expect(deleteRes.status).toBe(200);

      // Token should no longer appear in list
      const listRes = await app.request('/api/v1/users/me/tokens', {
        headers: { Authorization: AUTH },
      });
      const list = await listRes.json();
      expect(list).toHaveLength(0);
    });

    it('returns 404 for non-existent token', async () => {
      const res = await app.request('/api/v1/users/me/tokens/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: AUTH },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('API token authentication', () => {
    it('can authenticate using an API token as Bearer', async () => {
      // Create an API token via JWT auth
      const createRes = await app.request('/api/v1/users/me/tokens', {
        method: 'POST',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Auth test token' }),
      });
      const { token } = await createRes.json();

      // Use the API token to access a protected endpoint
      const res = await app.request('/api/v1/users/me/tokens', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });

    it('rejects expired API tokens', async () => {
      // Insert an expired token directly
      const { hashApiToken } = await import('../routes/users.js');
      const rawToken = 'xon_deadbeef'.padEnd(68, '0');
      const tokenHash = hashApiToken(rawToken);

      await db.insert(apiTokens).values({
        id: 'expired-token',
        userId: 'user-1',
        name: 'Expired',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      });

      const res = await app.request('/api/v1/users/me/tokens', {
        headers: { Authorization: `Bearer ${rawToken}` },
      });
      expect(res.status).toBe(401);
    });

    it('rejects unknown tokens', async () => {
      const res = await app.request('/api/v1/users/me/tokens', {
        headers: {
          Authorization:
            'Bearer xon_unknowntokenvalue1234567890abcdef1234567890abcdef1234567890abcd',
        },
      });
      expect(res.status).toBe(401);
    });
  });
});
