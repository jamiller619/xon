import { BasePlugin } from '@xon/plugin-sdk';
import type {
  PluginContext,
  PluginManifest,
  RouteDefinition,
} from '@xon/plugin-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { _registerPlugin, _resetForTesting } from '../../plugins/pluginManager.js';
import { signAccessToken } from '../../routes/auth.js';

const AUTH = `Bearer ${await signAccessToken('test-id', 'testuser', 'admin')}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'Test',
  author: 'Tester',
  category: 'Processor',
};

class SimplePlugin extends BasePlugin {
  readonly manifest = baseManifest;
}

function makeActiveEntry(
  routes: RouteDefinition[] = [],
  manifest: PluginManifest = baseManifest,
) {
  return _registerPlugin({
    manifest,
    pluginDir: '/fake/plugins/test-plugin',
    instance: new SimplePlugin(),
    status: 'active',
    hooks: [],
    routes,
    uiComponents: [],
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetForTesting();
});

afterEach(() => {
  _resetForTesting();
});

describe('pluginRouteDispatcher — basic routing', () => {
  it('returns 404 when plugin not in registry', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/plugins/unknown-plugin/status', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.any(String) });
  });

  it('returns 404 when plugin is not active (loaded)', async () => {
    _registerPlugin({
      manifest: baseManifest,
      pluginDir: '/fake',
      instance: new SimplePlugin(),
      status: 'loaded',
      hooks: [],
      routes: [],
      uiComponents: [],
    });
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/status', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  it('dispatches GET request to registered route', async () => {
    makeActiveEntry([
      {
        method: 'GET',
        path: '/status',
        handler: (c) => c.json({ ok: true }),
      },
    ]);
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/status', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('dispatches POST request to registered route', async () => {
    makeActiveEntry([
      {
        method: 'POST',
        path: '/items',
        handler: (c) => c.json({ created: true }, 201),
      },
    ]);
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ created: true });
  });

  it('returns 404 when route exists but method does not match', async () => {
    makeActiveEntry([
      {
        method: 'GET',
        path: '/status',
        handler: (c) => c.json({ ok: true }),
      },
    ]);
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/status', {
      method: 'POST',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when no registered route matches path', async () => {
    makeActiveEntry([
      {
        method: 'GET',
        path: '/status',
        handler: (c) => c.json({ ok: true }),
      },
    ]);
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/other', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });
});

describe('pluginRouteDispatcher — path params', () => {
  it('extracts named path params from route pattern', async () => {
    let capturedId: string | undefined;
    makeActiveEntry([
      {
        method: 'GET',
        path: '/items/:id',
        handler: (c) => {
          capturedId = c.req.param('id');
          return c.json({ id: capturedId });
        },
      },
    ]);
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/items/abc123', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    expect(capturedId).toBe('abc123');
    const body = await res.json();
    expect(body).toEqual({ id: 'abc123' });
  });

  it('extracts multiple named params', async () => {
    let capturedParams: Record<string, string> = {};
    makeActiveEntry([
      {
        method: 'GET',
        path: '/categories/:cat/items/:id',
        handler: (c) => {
          capturedParams = { cat: c.req.param('cat'), id: c.req.param('id') };
          return c.json(capturedParams);
        },
      },
    ]);
    const app = createApp();
    const res = await app.request(
      '/api/v1/plugins/test-plugin/categories/movies/items/42',
      {
        headers: { Authorization: AUTH },
      },
    );
    expect(res.status).toBe(200);
    expect(capturedParams).toEqual({ cat: 'movies', id: '42' });
  });
});

describe('pluginRouteDispatcher — query params', () => {
  it('exposes query params via c.req.query()', async () => {
    let capturedQuery: string | undefined;
    makeActiveEntry([
      {
        method: 'GET',
        path: '/search',
        handler: (c) => {
          capturedQuery = c.req.query('q');
          return c.json({ q: capturedQuery });
        },
      },
    ]);
    const app = createApp();
    const res = await app.request(
      '/api/v1/plugins/test-plugin/search?q=hello',
      {
        headers: { Authorization: AUTH },
      },
    );
    expect(res.status).toBe(200);
    expect(capturedQuery).toBe('hello');
  });
});

describe('pluginRouteDispatcher — routes removed on deactivation', () => {
  it('routes are inaccessible after entry.routes is cleared', async () => {
    const entry = makeActiveEntry([
      {
        method: 'GET',
        path: '/status',
        handler: (c) => c.json({ ok: true }),
      },
    ]);
    const app = createApp();

    // Route is accessible while active
    const res1 = await app.request('/api/v1/plugins/test-plugin/status', {
      headers: { Authorization: AUTH },
    });
    expect(res1.status).toBe(200);

    // Simulate deactivation by clearing routes and setting status
    entry.routes = [];
    entry.status = 'inactive';

    // Route is no longer accessible
    const res2 = await app.request('/api/v1/plugins/test-plugin/status', {
      headers: { Authorization: AUTH },
    });
    expect(res2.status).toBe(404);
  });
});

describe('pluginRouteDispatcher — multiple plugins', () => {
  it('routes are isolated per plugin namespace', async () => {
    const manifest2: PluginManifest = {
      id: 'other-plugin',
      name: 'Other Plugin',
      version: '1.0.0',
      description: 'Other',
      author: 'Tester',
      category: 'Processor',
    };

    class OtherPlugin extends BasePlugin {
      readonly manifest = manifest2;
    }

    makeActiveEntry(
      [
        {
          method: 'GET',
          path: '/status',
          handler: (c) => c.json({ plugin: 'test' }),
        },
      ],
      baseManifest,
    );

    _registerPlugin({
      manifest: manifest2,
      pluginDir: '/fake/plugins/other-plugin',
      instance: new OtherPlugin(),
      status: 'active',
      hooks: [],
      routes: [
        {
          method: 'GET',
          path: '/status',
          handler: (c) => c.json({ plugin: 'other' }),
        },
      ],
      uiComponents: [],
    });

    const app = createApp();

    const res1 = await app.request('/api/v1/plugins/test-plugin/status', {
      headers: { Authorization: AUTH },
    });
    const body1 = await res1.json();
    expect(body1).toEqual({ plugin: 'test' });

    const res2 = await app.request('/api/v1/plugins/other-plugin/status', {
      headers: { Authorization: AUTH },
    });
    const body2 = await res2.json();
    expect(body2).toEqual({ plugin: 'other' });
  });
});

describe('pluginRouteDispatcher — async handlers', () => {
  it('supports async route handlers', async () => {
    makeActiveEntry([
      {
        method: 'GET',
        path: '/async',
        handler: async (c) => {
          await Promise.resolve();
          return c.json({ async: true });
        },
      },
    ]);
    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/async', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ async: true });
  });
});

describe('pluginRouteDispatcher — context registered via activatePlugin', () => {
  it('routes registered during activate() are served', async () => {
    class RoutingPlugin extends BasePlugin {
      readonly manifest = baseManifest;
      override async activate(context: PluginContext) {
        context.registerRoute({
          method: 'GET',
          path: '/hello',
          handler: (c) => c.json({ hello: 'world' }),
        });
      }
    }

    const entry = _registerPlugin({
      manifest: baseManifest,
      pluginDir: '/fake',
      instance: new RoutingPlugin(),
      status: 'loaded',
      hooks: [],
      routes: [],
      uiComponents: [],
    });

    // Simulate what activatePlugin does: call activate with context
    const { activatePlugin } = await import('../../plugins/pluginManager.js');
    await activatePlugin('test-plugin');

    expect(entry.routes).toHaveLength(1);
    expect(entry.status).toBe('active');

    const app = createApp();
    const res = await app.request('/api/v1/plugins/test-plugin/hello', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hello: 'world' });
  });
});
