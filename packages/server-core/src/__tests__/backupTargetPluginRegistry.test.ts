import type {
  BackupTargetConfigSchema,
  BackupVerifyResult,
  PluginContext,
  PluginManifest,
} from '@xon/plugin-sdk';
import { BackupTargetPlugin } from '@xon/plugin-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetBackupTargetPluginRegistry,
  getBackupTargetPlugin,
  registerBackupTargetPlugin,
  unregisterBackupTargetPlugin,
} from '../backupTargetPluginRegistry.js';

// Minimal concrete BackupTargetPlugin for testing
class TestBackupPlugin extends BackupTargetPlugin {
  readonly manifest: PluginManifest = {
    id: 'test-backup',
    name: 'Test Backup',
    version: '1.0.0',
    description: 'Test',
    author: 'Test',
    category: 'BackupTarget',
  };

  readonly configSchema: BackupTargetConfigSchema = {
    fields: [
      { key: 'bucket', label: 'Bucket Name', type: 'string', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  };

  async upload(_localPath: string, _remotePath: string): Promise<void> {}
  async download(_remotePath: string, _localPath: string): Promise<void> {}
  async delete(_remotePath: string): Promise<void> {}
  async list(): Promise<string[]> {
    return [];
  }
  async verify(_remotePath: string): Promise<BackupVerifyResult> {
    return { exists: true };
  }

  // Suppress unused param warning in init
  override async init(_context: PluginContext): Promise<void> {}
}

afterEach(() => {
  _resetBackupTargetPluginRegistry();
});

describe('BackupTargetPlugin registry', () => {
  it('registers and retrieves a plugin by id', () => {
    const plugin = new TestBackupPlugin();
    registerBackupTargetPlugin('test-backup', plugin);
    expect(getBackupTargetPlugin('test-backup')).toBe(plugin);
  });

  it('returns undefined for an unregistered plugin', () => {
    expect(getBackupTargetPlugin('unknown')).toBeUndefined();
  });

  it('unregisters a plugin', () => {
    const plugin = new TestBackupPlugin();
    registerBackupTargetPlugin('test-backup', plugin);
    unregisterBackupTargetPlugin('test-backup');
    expect(getBackupTargetPlugin('test-backup')).toBeUndefined();
  });

  it('reset clears all registered plugins', () => {
    const plugin = new TestBackupPlugin();
    registerBackupTargetPlugin('test-backup', plugin);
    _resetBackupTargetPluginRegistry();
    expect(getBackupTargetPlugin('test-backup')).toBeUndefined();
  });

  it('overwrites registration for the same id', () => {
    const plugin1 = new TestBackupPlugin();
    const plugin2 = new TestBackupPlugin();
    registerBackupTargetPlugin('test-backup', plugin1);
    registerBackupTargetPlugin('test-backup', plugin2);
    expect(getBackupTargetPlugin('test-backup')).toBe(plugin2);
  });
});

describe('BackupTargetPlugin configSchema', () => {
  it('exposes configSchema with fields', () => {
    const plugin = new TestBackupPlugin();
    expect(plugin.configSchema.fields).toHaveLength(2);
    expect(plugin.configSchema.fields[0]).toMatchObject({
      key: 'bucket',
      label: 'Bucket Name',
      type: 'string',
      required: true,
    });
    expect(plugin.configSchema.fields[1]).toMatchObject({
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    });
  });
});
