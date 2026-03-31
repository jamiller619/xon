import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetMediaProviderPluginRegistry,
  getMediaProviderPlugin,
  registerMediaProviderPlugin,
  unregisterMediaProviderPlugin,
} from './mediaProviderPluginRegistry.js';

function makePlugin() {
  return {
    manifest: {
      id: 'test-provider',
      name: 'Test',
      version: '1.0.0',
      description: '',
      author: '',
      category: 'MediaProvider' as const,
    },
    configSchema: { fields: [] },
    init: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    uninstall: vi.fn(),
    listFiles: vi.fn(),
    getFile: vi.fn(),
    getStream: vi.fn(),
    watch: vi.fn(),
  };
}

beforeEach(() => {
  _resetMediaProviderPluginRegistry();
});

describe('mediaProviderPluginRegistry', () => {
  it('returns undefined for unregistered plugin', () => {
    expect(getMediaProviderPlugin('unknown')).toBeUndefined();
  });

  it('registers and retrieves a plugin', () => {
    const plugin = makePlugin();
    registerMediaProviderPlugin('my-provider', plugin as never);
    expect(getMediaProviderPlugin('my-provider')).toBe(plugin);
  });

  it('unregisters a plugin', () => {
    const plugin = makePlugin();
    registerMediaProviderPlugin('my-provider', plugin as never);
    unregisterMediaProviderPlugin('my-provider');
    expect(getMediaProviderPlugin('my-provider')).toBeUndefined();
  });

  it('overwrites an existing registration', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    registerMediaProviderPlugin('my-provider', plugin1 as never);
    registerMediaProviderPlugin('my-provider', plugin2 as never);
    expect(getMediaProviderPlugin('my-provider')).toBe(plugin2);
  });

  it('stores multiple plugins independently', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    registerMediaProviderPlugin('provider-a', plugin1 as never);
    registerMediaProviderPlugin('provider-b', plugin2 as never);
    expect(getMediaProviderPlugin('provider-a')).toBe(plugin1);
    expect(getMediaProviderPlugin('provider-b')).toBe(plugin2);
  });

  it('_reset clears all registrations', () => {
    const plugin = makePlugin();
    registerMediaProviderPlugin('my-provider', plugin as never);
    _resetMediaProviderPluginRegistry();
    expect(getMediaProviderPlugin('my-provider')).toBeUndefined();
  });
});
