import type { PluginContext, PluginManifest } from '@xon/plugin-sdk'
import { BasePlugin } from '@xon/plugin-sdk'

export class ModelViewerPlugin extends BasePlugin {
  // override readonly manifest: PluginManifest = {
  //   id: '3d-model-viewer',
  //   name: '3D Model Viewer',
  //   version: '1.0.0',
  //   description: 'WebGL viewer for OBJ, glTF, and GLB 3D models using Three.js',
  //   author: 'Xon',
  //   category: 'FormatHandler',
  //   // mediaCategories: [MediaCategory.Models3D],
  //   main: 'dist/index.js',
  // }

  override async init(context: PluginContext): Promise<void> {
    context.registerUI({
      id: 'model-viewer-panel',
      injectionPoint: 'detail-panel',
      bundleUrl: `/api/plugins/3d-model-viewer/assets/viewer.js`,
      label: '3D Model Viewer',
    })

    context.logger.info('3D Model Viewer plugin initialized')
  }
}

export default ModelViewerPlugin
