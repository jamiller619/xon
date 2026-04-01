import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { makeSecurityHeadersMiddleware } from './securityHeadersMiddleware.js';

function makeTestApp(options?: { isHttps?: boolean }): Hono {
  const app = new Hono();
  app.use('/*', makeSecurityHeadersMiddleware(options));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('makeSecurityHeadersMiddleware', () => {
  it('sets X-Content-Type-Options: nosniff', async () => {
    const app = makeTestApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const app = makeTestApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const app = makeTestApp();
    const res = await app.request('/test');
    expect(res.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('sets Content-Security-Policy header', async () => {
    const app = makeTestApp();
    const res = await app.request('/test');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('does not set Strict-Transport-Security when isHttps is false', async () => {
    const app = makeTestApp({ isHttps: false });
    const res = await app.request('/test');
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('does not set Strict-Transport-Security by default', async () => {
    const app = makeTestApp();
    const res = await app.request('/test');
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('sets Strict-Transport-Security when isHttps is true', async () => {
    const app = makeTestApp({ isHttps: true });
    const res = await app.request('/test');
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });
});
