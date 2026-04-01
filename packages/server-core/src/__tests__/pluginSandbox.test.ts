import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

import * as nodeFsPromises from 'node:fs/promises';
import {
  createSandboxedFetch,
  createSandboxedFs,
  isPathAllowed,
} from '../pluginSandbox.js';

const mockFs = vi.mocked(nodeFsPromises);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── isPathAllowed ───────────────────────────────────────────────────────────

describe('isPathAllowed', () => {
  it('returns true for exact directory match', () => {
    expect(isPathAllowed('/plugins/my-plugin', ['/plugins/my-plugin'])).toBe(
      true,
    );
  });

  it('returns true for a subpath within an allowed directory', () => {
    expect(
      isPathAllowed('/plugins/my-plugin/data/file.txt', ['/plugins/my-plugin']),
    ).toBe(true);
  });

  it('returns true when path matches one of multiple allowed directories', () => {
    expect(
      isPathAllowed('/data/cache/result.json', [
        '/plugins/my-plugin',
        '/data/cache',
      ]),
    ).toBe(true);
  });

  it('returns false for a non-allowed path', () => {
    expect(isPathAllowed('/etc/passwd', ['/plugins/my-plugin'])).toBe(false);
  });

  it('prevents traversal via ../ by resolving before comparing', () => {
    // /plugins/my-plugin/../../../etc/passwd resolves to /etc/passwd
    expect(
      isPathAllowed('/plugins/my-plugin/../../../etc/passwd', [
        '/plugins/my-plugin',
      ]),
    ).toBe(false);
  });

  it('returns false for a path that is a prefix but not a subdir', () => {
    // /plugins/my-plugin-evil should NOT be allowed by /plugins/my-plugin
    expect(
      isPathAllowed('/plugins/my-plugin-evil/secret', ['/plugins/my-plugin']),
    ).toBe(false);
  });

  it('returns false when allowedDirs is empty', () => {
    expect(isPathAllowed('/any/path', [])).toBe(false);
  });
});

// ─── createSandboxedFs ───────────────────────────────────────────────────────

describe('createSandboxedFs', () => {
  const pluginId = 'test-plugin';
  const pluginDir = '/plugins/test-plugin';
  const extraDir = '/data/media';

  describe('readFile', () => {
    it('allows readFile within pluginDir', async () => {
      const fakeBuffer = Buffer.from('hello');
      mockFs.readFile.mockResolvedValue(fakeBuffer as never);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      const result = await sandboxedFs.readFile(`${pluginDir}/config.json`);

      expect(mockFs.readFile).toHaveBeenCalledWith(`${pluginDir}/config.json`);
      expect(result).toBe(fakeBuffer);
    });

    it('allows readFile within declared additional path', async () => {
      const fakeBuffer = Buffer.from('media data');
      mockFs.readFile.mockResolvedValue(fakeBuffer as never);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, [extraDir]);
      const result = await sandboxedFs.readFile(`${extraDir}/movie.mp4`);

      expect(mockFs.readFile).toHaveBeenCalledWith(`${extraDir}/movie.mp4`);
      expect(result).toBe(fakeBuffer);
    });

    it('throws for readFile outside all allowed paths', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(sandboxedFs.readFile('/etc/passwd')).rejects.toThrow(
        '[plugin-sandbox:test-plugin] Filesystem access denied: /etc/passwd is not within allowed paths',
      );
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it('throws for traversal attempt via ../', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(
        sandboxedFs.readFile(`${pluginDir}/../../../etc/passwd`),
      ).rejects.toThrow('Filesystem access denied');
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });
  });

  describe('writeFile', () => {
    it('allows writeFile within pluginDir', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      await sandboxedFs.writeFile(`${pluginDir}/output.json`, '{}');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${pluginDir}/output.json`,
        '{}',
      );
    });

    it('throws for writeFile outside allowed paths', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(
        sandboxedFs.writeFile('/tmp/evil.sh', 'rm -rf /'),
      ).rejects.toThrow(
        '[plugin-sandbox:test-plugin] Filesystem access denied: /tmp/evil.sh is not within allowed paths',
      );
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('readdir', () => {
    it('allows readdir within pluginDir', async () => {
      mockFs.readdir.mockResolvedValue(['file1.txt', 'file2.txt'] as never);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      const entries = await sandboxedFs.readdir(pluginDir);

      expect(mockFs.readdir).toHaveBeenCalledWith(pluginDir);
      expect(entries).toEqual(['file1.txt', 'file2.txt']);
    });

    it('throws for readdir outside allowed paths', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(sandboxedFs.readdir('/etc')).rejects.toThrow(
        'Filesystem access denied',
      );
      expect(mockFs.readdir).not.toHaveBeenCalled();
    });
  });

  describe('stat', () => {
    it('allows stat within pluginDir and returns result', async () => {
      const fakeStat = {
        size: 1024,
        isFile: () => true,
        isDirectory: () => false,
      };
      mockFs.stat.mockResolvedValue(fakeStat as never);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      const result = await sandboxedFs.stat(`${pluginDir}/file.txt`);

      expect(mockFs.stat).toHaveBeenCalledWith(`${pluginDir}/file.txt`);
      expect(result.size).toBe(1024);
      expect(result.isFile()).toBe(true);
    });

    it('throws for stat outside allowed paths', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(sandboxedFs.stat('/etc/shadow')).rejects.toThrow(
        'Filesystem access denied',
      );
      expect(mockFs.stat).not.toHaveBeenCalled();
    });
  });

  describe('mkdir', () => {
    it('allows mkdir within pluginDir without options', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      await sandboxedFs.mkdir(`${pluginDir}/subdir`);

      expect(mockFs.mkdir).toHaveBeenCalledWith(`${pluginDir}/subdir`);
    });

    it('allows mkdir within pluginDir with recursive option', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      await sandboxedFs.mkdir(`${pluginDir}/nested/deep`, { recursive: true });

      expect(mockFs.mkdir).toHaveBeenCalledWith(`${pluginDir}/nested/deep`, {
        recursive: true,
      });
    });

    it('throws for mkdir outside allowed paths', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(sandboxedFs.mkdir('/tmp/hack')).rejects.toThrow(
        'Filesystem access denied',
      );
      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('allows unlink within pluginDir', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);
      await sandboxedFs.unlink(`${pluginDir}/old-file.txt`);

      expect(mockFs.unlink).toHaveBeenCalledWith(`${pluginDir}/old-file.txt`);
    });

    it('throws for unlink outside allowed paths', async () => {
      const sandboxedFs = createSandboxedFs(pluginId, pluginDir, []);

      await expect(sandboxedFs.unlink('/etc/crontab')).rejects.toThrow(
        'Filesystem access denied',
      );
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });
  });
});

// ─── createSandboxedFetch ────────────────────────────────────────────────────

describe('createSandboxedFetch', () => {
  const pluginId = 'net-plugin';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('allows request to a declared domain', async () => {
    const fakeResponse = new Response('ok');
    vi.mocked(globalThis.fetch).mockResolvedValue(fakeResponse);

    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com']);
    const result = await sandboxedFetch('https://api.example.com/data');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      undefined,
    );
    expect(result).toBe(fakeResponse);
  });

  it('passes RequestInit through to fetch', async () => {
    const fakeResponse = new Response('ok');
    vi.mocked(globalThis.fetch).mockResolvedValue(fakeResponse);

    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com']);
    const init: RequestInit = {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    };
    await sandboxedFetch('https://api.example.com/post', init);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/post',
      init,
    );
  });

  it('allows request to a subdomain of a declared domain', async () => {
    const fakeResponse = new Response('ok');
    vi.mocked(globalThis.fetch).mockResolvedValue(fakeResponse);

    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com']);
    await sandboxedFetch('https://v2.api.example.com/resource');

    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('throws for request to an undeclared domain', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, ['api.example.com']);

    await expect(sandboxedFetch('https://evil.com/steal')).rejects.toThrow(
      '[plugin-sandbox:net-plugin] Network access denied: evil.com is not within allowed domains',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('blocks all requests when allowedDomains is empty', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, []);

    await expect(sandboxedFetch('https://example.com/api')).rejects.toThrow(
      'Network access denied',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws for an invalid URL', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, ['example.com']);

    await expect(sandboxedFetch('not-a-url')).rejects.toThrow(
      'Network access denied',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not allow a domain that merely contains the allowed domain as a substring', async () => {
    const sandboxedFetch = createSandboxedFetch(pluginId, ['example.com']);

    // "notexample.com" should NOT be allowed just because it ends with "example.com"
    await expect(sandboxedFetch('https://notexample.com/api')).rejects.toThrow(
      'Network access denied',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
