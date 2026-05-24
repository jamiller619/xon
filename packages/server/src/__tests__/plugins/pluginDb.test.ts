import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../db/db.ts'
import {
  createPluginDatabaseAccess,
  validatePluginSql,
} from '../../plugins/pluginDb.ts'

// ─── validatePluginSql ───────────────────────────────────────────────────────

describe('validatePluginSql', () => {
  it('allows SELECT on any table', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'SELECT * FROM libraries'),
    ).not.toThrow()
    expect(() =>
      validatePluginSql('my-plugin', 'SELECT id FROM media_items WHERE id = ?'),
    ).not.toThrow()
  })

  it('allows SELECT case-insensitively', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'select * from libraries'),
    ).not.toThrow()
    expect(() =>
      validatePluginSql('my-plugin', 'Select id From media_items'),
    ).not.toThrow()
  })

  it('allows PRAGMA statements', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'PRAGMA table_info(libraries)'),
    ).not.toThrow()
  })

  it('allows EXPLAIN statements', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'EXPLAIN SELECT * FROM media_items'),
    ).not.toThrow()
  })

  it('allows CREATE TABLE with correct plugin prefix', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'CREATE TABLE plugin_my_plugin_settings (key TEXT, value TEXT)',
      ),
    ).not.toThrow()
  })

  it('allows CREATE TABLE IF NOT EXISTS with correct prefix', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'CREATE TABLE IF NOT EXISTS plugin_my_plugin_cache (id TEXT PRIMARY KEY)',
      ),
    ).not.toThrow()
  })

  it('rejects CREATE TABLE without plugin prefix', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'CREATE TABLE custom_data (id TEXT)'),
    ).toThrow('must be prefixed with "plugin_my_plugin_"')
  })

  it('rejects CREATE TABLE on core table', () => {
    // Even though SQLite won't allow re-creating an existing table without IF NOT EXISTS,
    // the validator must still block it
    expect(() =>
      validatePluginSql('my-plugin', 'CREATE TABLE libraries (id TEXT)'),
    ).toThrow('write access denied to core table "libraries"')
  })

  it('allows INSERT INTO plugin-prefixed table', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'INSERT INTO plugin_my_plugin_settings (key, value) VALUES (?, ?)',
      ),
    ).not.toThrow()
  })

  it('rejects INSERT INTO core table', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'INSERT INTO media_items (id) VALUES (?)'),
    ).toThrow('write access denied to core table "media_items"')
  })

  it("rejects INSERT INTO another plugin's table", () => {
    expect(() =>
      validatePluginSql(
        'plugin-a',
        'INSERT INTO plugin_plugin_b_data (x) VALUES (1)',
      ),
    ).toThrow('must be prefixed with "plugin_plugin_a_"')
  })

  it('allows UPDATE on plugin-prefixed table', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'UPDATE plugin_my_plugin_settings SET value = ? WHERE key = ?',
      ),
    ).not.toThrow()
  })

  it('rejects UPDATE on core table', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'UPDATE libraries SET name = ? WHERE id = ?',
      ),
    ).toThrow('write access denied to core table "libraries"')
  })

  it('allows DELETE FROM plugin-prefixed table', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'DELETE FROM plugin_my_plugin_settings WHERE key = ?',
      ),
    ).not.toThrow()
  })

  it('rejects DELETE FROM core table', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'DELETE FROM data_sources WHERE id = ?'),
    ).toThrow('write access denied to core table "data_sources"')
  })

  it('allows DROP TABLE on plugin-prefixed table', () => {
    expect(() =>
      validatePluginSql(
        'my-plugin',
        'DROP TABLE IF EXISTS plugin_my_plugin_cache',
      ),
    ).not.toThrow()
  })

  it('rejects DROP TABLE on core table', () => {
    expect(() =>
      validatePluginSql('my-plugin', 'DROP TABLE media_items'),
    ).toThrow('write access denied to core table "media_items"')
  })

  it('rejects unsupported statements', () => {
    expect(() =>
      validatePluginSql('my-plugin', "ATTACH DATABASE 'other.db' AS other"),
    ).toThrow('unsupported or unrecognised')
  })

  it('converts plugin ID hyphens to underscores for prefix', () => {
    // plugin id "my-cool-plugin" → prefix "plugin_my_cool_plugin_"
    expect(() =>
      validatePluginSql(
        'my-cool-plugin',
        'CREATE TABLE plugin_my_cool_plugin_data (id TEXT)',
      ),
    ).not.toThrow()
    expect(() =>
      validatePluginSql(
        'my-cool-plugin',
        'CREATE TABLE plugin_mycoolplugin_data (id TEXT)',
      ),
    ).toThrow('must be prefixed with "plugin_my_cool_plugin_"')
  })

  it('isolates plugins from each other', () => {
    // Plugin A cannot write to Plugin B's tables
    expect(() =>
      validatePluginSql(
        'plugin-a',
        'INSERT INTO plugin_plugin_b_data (x) VALUES (1)',
      ),
    ).toThrow('must be prefixed with "plugin_plugin_a_"')
    // Plugin B CAN write to its own tables
    expect(() =>
      validatePluginSql(
        'plugin-b',
        'INSERT INTO plugin_plugin_b_data (x) VALUES (1)',
      ),
    ).not.toThrow()
  })
})

// ─── createPluginDatabaseAccess ──────────────────────────────────────────────

describe('createPluginDatabaseAccess', () => {
  async function setup() {
    const { client, db } = await openDatabase(':memory:')
    // Ensure foreign keys work and create a minimal core table for read tests
    await client.execute(`
      CREATE TABLE IF NOT EXISTS libraries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        allowed_media_types TEXT NOT NULL DEFAULT '[]',
        scan_schedule TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)
    await client.execute(
      "INSERT INTO libraries (id, name) VALUES ('lib-1', 'My Library')",
    )
    return { client, db }
  }

  it('executes SELECT and returns row objects', async () => {
    const { client } = await setup()
    const access = createPluginDatabaseAccess('my-plugin', client)

    const rows = await access.query('SELECT id, name FROM libraries')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ id: 'lib-1', name: 'My Library' })
  })

  it('passes query parameters to the statement', async () => {
    const { client } = await setup()
    const access = createPluginDatabaseAccess('my-plugin', client)

    const rows = await access.query('SELECT id FROM libraries WHERE id = ?', [
      'lib-1',
    ])
    expect(rows).toHaveLength(1)

    const empty = await access.query('SELECT id FROM libraries WHERE id = ?', [
      'nonexistent',
    ])
    expect(empty).toHaveLength(0)
  })

  it('allows plugin to create its own table and insert/query data', async () => {
    const { client } = await setup()
    const access = createPluginDatabaseAccess('my-plugin', client)

    await access.query(
      'CREATE TABLE IF NOT EXISTS plugin_my_plugin_prefs (key TEXT PRIMARY KEY, value TEXT)',
    )
    await access.query(
      'INSERT INTO plugin_my_plugin_prefs (key, value) VALUES (?, ?)',
      ['theme', 'dark'],
    )

    const rows = await access.query(
      'SELECT key, value FROM plugin_my_plugin_prefs',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ key: 'theme', value: 'dark' })
  })

  it('throws synchronously when SQL is not permitted (before executing)', async () => {
    const { client } = await setup()
    const access = createPluginDatabaseAccess('my-plugin', client)

    await expect(
      access.query('INSERT INTO libraries (id, name) VALUES (?, ?)', [
        'x',
        'y',
      ]),
    ).rejects.toThrow('write access denied to core table')
  })

  it("plugin A cannot write to plugin B's table", async () => {
    const { client } = await setup()
    const accessA = createPluginDatabaseAccess('plugin-a', client)
    const accessB = createPluginDatabaseAccess('plugin-b', client)

    // Create plugin-b's table using plugin-b's access
    await accessB.query(
      'CREATE TABLE IF NOT EXISTS plugin_plugin_b_data (x TEXT)',
    )

    // Plugin A should not be able to write to plugin B's table
    await expect(
      accessA.query('INSERT INTO plugin_plugin_b_data (x) VALUES (?)', [
        'stolen',
      ]),
    ).rejects.toThrow('must be prefixed with "plugin_plugin_a_"')

    // Plugin A can still SELECT from plugin B's table (read access is unrestricted)
    await expect(
      accessA.query('SELECT x FROM plugin_plugin_b_data'),
    ).resolves.toEqual([])
  })

  it('returns empty array for statements that produce no rows', async () => {
    const { client } = await setup()
    const access = createPluginDatabaseAccess('my-plugin', client)

    await access.query(
      'CREATE TABLE IF NOT EXISTS plugin_my_plugin_log (msg TEXT)',
    )
    const result = await access.query(
      'INSERT INTO plugin_my_plugin_log (msg) VALUES (?)',
      ['hello'],
    )
    expect(result).toEqual([])
  })
})
