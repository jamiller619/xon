import { BasePlugin } from './BasePlugin.js';
import type { BackupTargetConfigSchema, BackupVerifyResult } from './types.js';

/**
 * Abstract base class for BackupTarget plugins.
 * Plugin authors extend this class to implement cloud or custom storage backends.
 *
 * The backup engine calls these methods when a backup target's type is "plugin".
 */
export abstract class BackupTargetPlugin extends BasePlugin {
  /**
   * JSON schema describing the configuration fields this plugin requires.
   * Used by the admin UI to render a configuration form.
   */
  abstract readonly configSchema: BackupTargetConfigSchema;

  /**
   * Upload a local file to the remote storage.
   * @param localPath  Absolute path to the source file on the local filesystem
   * @param remotePath Relative path used to identify the file in the remote storage
   */
  abstract upload(localPath: string, remotePath: string): Promise<void>;

  /**
   * Download a file from the remote storage to a local path.
   * @param remotePath Relative path identifying the file in remote storage
   * @param localPath  Absolute path where the file should be written locally
   */
  abstract download(remotePath: string, localPath: string): Promise<void>;

  /**
   * Delete a file from the remote storage.
   * @param remotePath Relative path identifying the file in remote storage
   */
  abstract delete(remotePath: string): Promise<void>;

  /**
   * List all files currently stored in the remote storage.
   * @returns Array of remote paths
   */
  abstract list(): Promise<string[]>;

  /**
   * Verify that a file exists in the remote storage and optionally return its checksum/size.
   * @param remotePath Relative path identifying the file in remote storage
   * @returns Verification result with existence status and optional integrity metadata
   */
  abstract verify(remotePath: string): Promise<BackupVerifyResult>;
}
