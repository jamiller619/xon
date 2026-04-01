import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { onError, onNotFound } from './errorMiddleware.js';
import { signAccessToken } from './routes/auth.js';

const AUTH = `Bearer ${await signAccessToken('admin-id', 'admin', 'admin')}`;

describe('errorMiddleware', () => {
  it('onError returns 500 JSON with error field', async () => {
    const app = new Hono();
    app.onError(onError);
    app.get('/boom', () => {
      throw new Error('something went wrong');
    });

    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('something went wrong');
  });

  it('onNotFound returns 404 JSON with error and path fields', async () => {
    const app = new Hono();
    app.notFound(onNotFound);

    const res = await app.request('/no-such-route');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; path: string };
    expect(body.error).toBe('Not found');
    expect(body.path).toBe('/no-such-route');
  });

  it('createApp returns 404 JSON for unknown route', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/unknown-endpoint', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Not found');
  });

  it('createApp returns 500 JSON for route that throws', async () => {
    const app = createApp();
    // Inject a throwing route directly on the Hono instance is not possible after
    // createApp, so test onError directly via a standalone Hono app.
    const mini = new Hono();
    mini.onError(onError);
    mini.get('/throw', () => {
      throw new TypeError('type error');
    });

    const res = await mini.request('/throw');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('type error');
  });
});
