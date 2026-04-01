import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { openDatabase } from '../../db.js';
import { migrateDatabase } from '../../migrate.js';
import { hashPassword } from '../../password.js';
import { users } from '../../schema.js';
import { signAccessToken } from '../../routes/auth.js';

const AUTH = `Bearer ${await signAccessToken('user-1', 'testuser', 'user')}`;

describe('Users API', () => {
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
      passwordHash: await hashPassword('password123'),
      role: 'user',
    });
  });

  afterEach(() => {
    client.close();
  });

  // ─── GET /users/me ───────────────────────────────────────────────────────────

  describe('GET /api/v1/users/me', () => {
    it('returns the current user profile', async () => {
      const res = await app.request('/api/v1/users/me', {
        headers: { Authorization: AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'user',
      });
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/v1/users/me');
      expect(res.status).toBe(401);
    });
  });

  // ─── PUT /users/me ───────────────────────────────────────────────────────────

  describe('PUT /api/v1/users/me', () => {
    it('updates display name', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'New Name' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe('New Name');
    });

    it('updates email', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe('new@example.com');
    });

    it('updates avatarUrl', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: 'https://example.com/avatar.png' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('updates maxContentRating and hideDrmItems', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxContentRating: 'PG-13', hideDrmItems: true }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.maxContentRating).toBe('PG-13');
      expect(body.hideDrmItems).toBe(true);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'x' }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── PUT /users/me/password ──────────────────────────────────────────────────

  describe('PUT /api/v1/users/me/password', () => {
    it('changes password with correct current password', async () => {
      const res = await app.request('/api/v1/users/me/password', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('message');
    });

    it('returns 400 for wrong current password', async () => {
      const res = await app.request('/api/v1/users/me/password', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword456',
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Current password is incorrect');
    });

    it('returns 400 if new password too short', async () => {
      const res = await app.request('/api/v1/users/me/password', {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'password123',
          newPassword: 'short',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/v1/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'password123',
          newPassword: 'newpassword456',
        }),
      });
      expect(res.status).toBe(401);
    });
  });
});
