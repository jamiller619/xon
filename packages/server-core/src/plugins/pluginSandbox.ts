import {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { normalize, resolve } from 'node:path';

export interface SandboxedFs {
  readFile: (path: string) => Promise<Buffer>;
  writeFile: (path: string, data: string | Buffer) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  stat: (
    path: string,
  ) => Promise<{
    size: number;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

export type SandboxedFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Check if a given absolute path is within one of the allowed base directories.
 */
export function isPathAllowed(
  targetPath: string,
  allowedDirs: string[],
): boolean {
  const normalized = normalize(resolve(targetPath));
  return allowedDirs.some((dir) => {
    const normalizedDir = normalize(resolve(dir));
    return (
      normalized === normalizedDir || normalized.startsWith(`${normalizedDir}/`)
    );
  });
}

/**
 * Create a sandboxed fs wrapper for a plugin.
 * The plugin may access its own pluginDir plus any paths declared in permissions.filesystem.
 */
export function createSandboxedFs(
  pluginId: string,
  pluginDir: string,
  allowedPaths: string[],
): SandboxedFs {
  const allAllowedDirs = [pluginDir, ...allowedPaths];

  function assertPathAllowed(targetPath: string, op: string): void {
    if (!isPathAllowed(targetPath, allAllowedDirs)) {
      const msg = `[plugin-sandbox:${pluginId}] Filesystem access denied: ${targetPath} is not within allowed paths`;
      console.warn(`[plugin-sandbox:${pluginId}] ${op} denied: ${targetPath}`);
      throw new Error(msg);
    }
  }

  return {
    async readFile(path: string): Promise<Buffer> {
      assertPathAllowed(path, 'readFile');
      return readFile(path);
    },

    async writeFile(path: string, data: string | Buffer): Promise<void> {
      assertPathAllowed(path, 'writeFile');
      await writeFile(path, data);
    },

    async readdir(path: string): Promise<string[]> {
      assertPathAllowed(path, 'readdir');
      return readdir(path);
    },

    async stat(
      path: string,
    ): Promise<{
      size: number;
      isFile: () => boolean;
      isDirectory: () => boolean;
    }> {
      assertPathAllowed(path, 'stat');
      return stat(path);
    },

    async mkdir(
      path: string,
      options?: { recursive?: boolean },
    ): Promise<void> {
      assertPathAllowed(path, 'mkdir');
      if (options !== undefined) {
        await mkdir(path, options);
      } else {
        await mkdir(path);
      }
    },

    async unlink(path: string): Promise<void> {
      assertPathAllowed(path, 'unlink');
      await unlink(path);
    },
  };
}

/**
 * Create a sandboxed fetch wrapper for a plugin.
 * Only allows requests to declared network domains.
 */
export function createSandboxedFetch(
  pluginId: string,
  allowedDomains: string[],
): SandboxedFetch {
  return async function sandboxedFetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      const msg = `[plugin-sandbox:${pluginId}] Network access denied: invalid URL "${url}"`;
      console.warn(msg);
      throw new Error(msg);
    }

    const allowed = allowedDomains.some((domain) => {
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });

    if (!allowed) {
      const msg = `[plugin-sandbox:${pluginId}] Network access denied: ${hostname} is not within allowed domains`;
      console.warn(`[plugin-sandbox:${pluginId}] fetch denied: ${hostname}`);
      throw new Error(msg);
    }

    return fetch(url, init);
  };
}
