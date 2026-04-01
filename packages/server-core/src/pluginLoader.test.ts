import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverPluginManifests } from './pluginLoader.js';

const baseManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Test Author',
  category: 'Processor',
};

describe('discoverPluginManifests', () => {
  let pluginDir: string;

  beforeEach(async () => {
    pluginDir = await mkdtemp(join(tmpdir(), 'xon-plugins-test-'));
  });

  afterEach(async () => {
    await rm(pluginDir, { recursive: true, force: true });
  });

  it('returns empty array when plugin directory does not exist', async () => {
    const results = await discoverPluginManifests(
      join(pluginDir, 'nonexistent'),
    );
    expect(results).toEqual([]);
  });

  it('returns empty array when plugin directory is empty', async () => {
    const results = await discoverPluginManifests(pluginDir);
    expect(results).toEqual([]);
  });

  it('ignores non-directory entries', async () => {
    await writeFile(join(pluginDir, 'not-a-plugin.txt'), 'hello');
    const results = await discoverPluginManifests(pluginDir);
    expect(results).toHaveLength(0);
  });

  describe('loading from package.json xon field', () => {
    it('loads manifest from package.json xon field', async () => {
      const p = join(pluginDir, 'my-plugin');
      await mkdir(p);
      await writeFile(
        join(p, 'package.json'),
        JSON.stringify({ name: 'my-plugin', xon: baseManifest }),
      );

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.manifest).toMatchObject(baseManifest);
      }
    });

    it('skips package.json without xon field and falls through', async () => {
      const p = join(pluginDir, 'my-plugin');
      await mkdir(p);
      await writeFile(
        join(p, 'package.json'),
        JSON.stringify({ name: 'my-plugin' }),
      );
      await writeFile(join(p, 'xon.config.json'), JSON.stringify(baseManifest));

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
    });
  });

  describe('loading from xon.config.json', () => {
    it('loads manifest from xon.config.json when no package.json xon field', async () => {
      const p = join(pluginDir, 'my-plugin');
      await mkdir(p);
      await writeFile(join(p, 'xon.config.json'), JSON.stringify(baseManifest));

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.manifest.id).toBe('test-plugin');
        expect(result.manifest.category).toBe('Processor');
      }
    });
  });

  describe('loading from xon.config.ts', () => {
    it('loads manifest from xon.config.ts when no JSON sources found', async () => {
      const p = join(pluginDir, 'ts-plugin');
      await mkdir(p);
      const tsContent = `export default ${JSON.stringify(baseManifest)};`;
      await writeFile(join(p, 'xon.config.ts'), tsContent);

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.manifest.id).toBe('test-plugin');
      }
    });
  });

  describe('manifest validation', () => {
    it('rejects plugin with missing required field', async () => {
      const p = join(pluginDir, 'bad-plugin');
      await mkdir(p);
      const { category: _unused, ...noCategory } = baseManifest;
      await writeFile(join(p, 'xon.config.json'), JSON.stringify(noCategory));

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(false);
      if (!result?.success) {
        expect(result.error).toMatch(/category/);
      }
    });

    it('rejects plugin with invalid category', async () => {
      const p = join(pluginDir, 'bad-plugin');
      await mkdir(p);
      await writeFile(
        join(p, 'xon.config.json'),
        JSON.stringify({ ...baseManifest, category: 'InvalidCategory' }),
      );

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(false);
      if (!result?.success) {
        expect(result.error).toMatch(/invalid category/i);
      }
    });

    it('returns failure when no manifest source is found', async () => {
      const p = join(pluginDir, 'empty-plugin');
      await mkdir(p);

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(false);
      if (!result?.success) {
        expect(result.error).toMatch(/No plugin manifest found/);
      }
    });

    it('accepts manifest with optional fields', async () => {
      const p = join(pluginDir, 'full-plugin');
      await mkdir(p);
      const fullManifest = {
        ...baseManifest,
        mediaCategories: ['Movies', 'TV Shows'],
        minServerVersion: '1.0.0',
        main: 'dist/index.js',
      };
      await writeFile(join(p, 'xon.config.json'), JSON.stringify(fullManifest));

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.manifest.mediaCategories).toEqual(['Movies', 'TV Shows']);
        expect(result.manifest.minServerVersion).toBe('1.0.0');
        expect(result.manifest.main).toBe('dist/index.js');
      }
    });

    it('one failed plugin does not affect other plugins', async () => {
      const good = join(pluginDir, 'good-plugin');
      await mkdir(good);
      await writeFile(
        join(good, 'xon.config.json'),
        JSON.stringify(baseManifest),
      );

      const bad = join(pluginDir, 'bad-plugin');
      await mkdir(bad);
      await writeFile(
        join(bad, 'xon.config.json'),
        JSON.stringify({ name: 'no required fields' }),
      );

      const results = await discoverPluginManifests(pluginDir);
      expect(results).toHaveLength(2);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
    });
  });
});
