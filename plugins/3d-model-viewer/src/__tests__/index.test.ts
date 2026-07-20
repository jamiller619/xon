import type { PluginContext } from '@xon/plugin-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModelViewerPlugin from '../index.js'

describe('ModelViewerPlugin', () => {
  let plugin: ModelViewerPlugin

  beforeEach(() => {
    plugin = new ModelViewerPlugin()
  })

  describe('manifest', () => {
    it('has correct id', () => {
      expect(plugin.manifest.id).toBe('3d-model-viewer')
    })

    it('has FormatHandler category', () => {
      expect(plugin.manifest.category).toBe('FormatHandler')
    })

    it('handles 3D Models media category', () => {
      expect(plugin.manifest.mediaCategories).toContain('3D Models')
    })

    it('has main entry point', () => {
      expect(plugin.manifest.main).toBe('dist/index.js')
    })
  })

  describe('init', () => {
    it('registers a detail-panel UI component', async () => {
      const registeredComponents: unknown[] = []
      const mockContext: PluginContext = {
        manifest: plugin.manifest,
        db: { query: vi.fn().mockResolvedValue([]) },
        on: vi.fn(),
        registerRoute: vi.fn(),
        registerUI: vi.fn((component) => registeredComponents.push(component)),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        images: { save: vi.fn() },
        fetch: vi.fn(),
      }

      await plugin.init(mockContext)

      expect(mockContext.registerUI).toHaveBeenCalledOnce()
      expect(registeredComponents[0]).toMatchObject({
        id: 'model-viewer-panel',
        injectionPoint: 'detail-panel',
        bundleUrl: '/api/plugins/3d-model-viewer/assets/viewer.js',
        label: '3D Model Viewer',
      })
    })

    it('does not register any event hooks', async () => {
      const mockContext: PluginContext = {
        manifest: plugin.manifest,
        db: { query: vi.fn().mockResolvedValue([]) },
        on: vi.fn(),
        registerRoute: vi.fn(),
        registerUI: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        images: { save: vi.fn() },
        fetch: vi.fn(),
      }

      await plugin.init(mockContext)

      expect(mockContext.on).not.toHaveBeenCalled()
    })

    it('does not register any API routes', async () => {
      const mockContext: PluginContext = {
        manifest: plugin.manifest,
        db: { query: vi.fn().mockResolvedValue([]) },
        on: vi.fn(),
        registerRoute: vi.fn(),
        registerUI: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        images: { save: vi.fn() },
        fetch: vi.fn(),
      }

      await plugin.init(mockContext)

      expect(mockContext.registerRoute).not.toHaveBeenCalled()
    })

    it('logs initialization info', async () => {
      const mockContext: PluginContext = {
        manifest: plugin.manifest,
        db: { query: vi.fn().mockResolvedValue([]) },
        on: vi.fn(),
        registerRoute: vi.fn(),
        registerUI: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        images: { save: vi.fn() },
        fetch: vi.fn(),
      }

      await plugin.init(mockContext)

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        '3D Model Viewer plugin initialized',
      )
    })
  })
})
