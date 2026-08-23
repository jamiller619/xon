# Integer primary-key migration runbook

Migration `0013_volatile_whiplash.sql` converts Xon's active core and Better
Auth entity keys to internal incrementing integers while preserving every old
text ID as `public_id`. The migration is forward-only and must ship with the
application build that understands the new schema.

## Before deployment

1. Stop every Xon process that can write the database, including scanner child
   processes.
2. Take a recoverable, WAL-consistent backup. Keep the database, `-wal`, and
   `-shm` files together unless the backup tool checkpoints them atomically.
3. Restore that backup to a disposable location and run the normal migration
   command against the copy first.

## Verification

On the migrated copy and again after production migration, verify:

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

`integrity_check` must return `ok`; `foreign_key_check` must return no rows.
Smoke-test an existing library URL, existing media URL, search, playback,
collection membership, the active login, creation of a new entity, and session
revocation. Existing URL IDs should be unchanged; newly created public IDs are
12 characters from `346789abcdefghijkmnpqrtwxyz`.

## Rollback

If migration or smoke verification fails, stop Xon and restore the
pre-migration backup. Do not attempt an improvised reverse migration.
