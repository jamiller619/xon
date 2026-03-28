import type { Client, InValue } from "@libsql/client";
import type { PluginDatabaseAccess } from "@xon/plugin-sdk";

/** Core tables that plugins are never permitted to write to */
const CORE_TABLES = new Set(["libraries", "data_sources", "media_items", "reading_positions"]);

/** Convert a plugin ID to a safe snake_case segment for table name prefixes */
function toTableSegment(pluginId: string): string {
  return pluginId.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

/**
 * Validate that the given SQL statement is permitted for the plugin.
 *
 * Rules:
 * - SELECT / PRAGMA / EXPLAIN: allowed on any table (read-only access to all data)
 * - CREATE TABLE / INSERT / UPDATE / DELETE / DROP TABLE: only permitted on
 *   tables with the `plugin_<pluginId>_` prefix; core tables are always blocked.
 * - All other statements: rejected.
 *
 * @throws if the statement is not permitted.
 */
export function validatePluginSql(pluginId: string, sql: string): void {
  const normalized = sql.trim().toLowerCase();

  // Read-only statements are always allowed
  if (
    /^select\b/.test(normalized) ||
    /^pragma\b/.test(normalized) ||
    /^explain\b/.test(normalized)
  ) {
    return;
  }

  const prefix = `plugin_${toTableSegment(pluginId)}_`;

  // Extract the target table name from supported DDL/DML patterns
  const tableMatch =
    normalized.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?[`"[]?(\w+)/) ??
    normalized.match(/^insert\s+(?:or\s+\w+\s+)?into\s+[`"[]?(\w+)/) ??
    normalized.match(/^update\s+[`"[]?(\w+)/) ??
    normalized.match(/^delete\s+from\s+[`"[]?(\w+)/) ??
    normalized.match(/^drop\s+table\s+(?:if\s+exists\s+)?[`"[]?(\w+)/);

  if (!tableMatch?.[1]) {
    throw new Error(`Plugin "${pluginId}": unsupported or unrecognised SQL statement`);
  }

  const tableName = tableMatch[1];

  if (CORE_TABLES.has(tableName)) {
    throw new Error(`Plugin "${pluginId}": write access denied to core table "${tableName}"`);
  }

  if (!tableName.startsWith(prefix)) {
    throw new Error(
      `Plugin "${pluginId}": write access denied to table "${tableName}". ` +
        `Plugin tables must be prefixed with "${prefix}"`
    );
  }
}

/**
 * Build a scoped PluginDatabaseAccess for a plugin using a raw libSQL Client.
 *
 * - SELECT queries may read any table (libraries, media_items, etc.)
 * - Write operations (INSERT, UPDATE, DELETE, CREATE/DROP TABLE) are restricted
 *   to tables prefixed with `plugin_<pluginId>_`.
 * - Core tables are always read-only.
 */
export function createPluginDatabaseAccess(pluginId: string, client: Client): PluginDatabaseAccess {
  return {
    async query(sql: string, params?: unknown[]): Promise<unknown[]> {
      validatePluginSql(pluginId, sql);

      const result = await client.execute({
        sql,
        args: (params as InValue[]) ?? [],
      });

      return result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < result.columns.length; i++) {
          const col = result.columns[i];
          if (col !== undefined) {
            obj[col] = row[i];
          }
        }
        return obj;
      });
    },
  };
}
