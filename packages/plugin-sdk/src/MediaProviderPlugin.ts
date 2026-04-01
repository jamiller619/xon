import { BasePlugin } from './BasePlugin.js';
import type {
  MediaProviderConfigSchema,
  MediaProviderFile,
  WatchCallback,
} from './types.js';

/**
 * Abstract base class for MediaProvider plugins.
 * Plugin authors extend this class to connect external storage (e.g. Google Drive, S3)
 * as data sources for Xon libraries.
 *
 * When a data source has type "plugin", the scanner delegates file discovery
 * to the registered MediaProviderPlugin instance.
 */
export abstract class MediaProviderPlugin extends BasePlugin {
  /**
   * JSON schema describing the configuration fields this plugin requires
   * for data source setup (e.g. auth tokens, root paths, bucket names).
   * Used by the admin UI to render a configuration form.
   */
  abstract readonly configSchema: MediaProviderConfigSchema;

  /**
   * List all media files under the given path in the remote storage.
   * @param path Virtual path within the remote storage to enumerate
   * @returns Array of file entries with id, name, path, size, and optional metadata
   */
  abstract listFiles(path: string): Promise<MediaProviderFile[]>;

  /**
   * Retrieve the full content of a file by its remote id.
   * @param id Unique identifier for the file (from MediaProviderFile.id)
   * @returns File contents as a Uint8Array
   */
  abstract getFile(id: string): Promise<Uint8Array>;

  /**
   * Open a streaming read for a file by its remote id.
   * Prefer this over getFile() for large media files.
   * @param id Unique identifier for the file (from MediaProviderFile.id)
   * @returns ReadableStream of the file contents
   */
  abstract getStream(id: string): Promise<ReadableStream<Uint8Array>>;

  /**
   * Watch for file changes in the remote storage and invoke the callback
   * whenever a file is created, updated, or deleted.
   * @param callback Function called with event type and affected file
   * @returns Unsubscribe function — call it to stop watching
   */
  abstract watch(callback: WatchCallback): Promise<() => void>;
}
