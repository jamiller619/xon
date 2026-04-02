-- FTS5 virtual table for full-text search on media items.
-- rowid is synced to media_items.rowid so DELETE by rowid always works.
CREATE VIRTUAL TABLE media_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  file_name,
  tags,
  text_metadata,
  tokenize='unicode61'
);
--> statement-breakpoint
-- Backfill existing media items into the FTS index (rowid synced to media_items rowid)
INSERT INTO media_fts(rowid, id, title, description, file_name, tags, text_metadata)
SELECT
  rowid,
  id,
  COALESCE(title, ''),
  COALESCE(description, ''),
  file_name,
  COALESCE(json_extract(metadata, '$.tags'), ''),
  COALESCE(metadata, '{}')
FROM media_items;
--> statement-breakpoint
-- Trigger: insert new media item into FTS index (rowid synced)
CREATE TRIGGER media_fts_insert AFTER INSERT ON media_items BEGIN
  INSERT INTO media_fts(rowid, id, title, description, file_name, tags, text_metadata)
  VALUES (
    new.rowid,
    new.id,
    COALESCE(new.title, ''),
    COALESCE(new.description, ''),
    new.file_name,
    COALESCE(json_extract(new.metadata, '$.tags'), ''),
    COALESCE(new.metadata, '{}')
  );
END;
--> statement-breakpoint
-- Trigger: update FTS index when media item changes (delete by rowid + re-insert)
CREATE TRIGGER media_fts_update AFTER UPDATE ON media_items BEGIN
  DELETE FROM media_fts WHERE rowid = old.rowid;
  INSERT INTO media_fts(rowid, id, title, description, file_name, tags, text_metadata)
  VALUES (
    new.rowid,
    new.id,
    COALESCE(new.title, ''),
    COALESCE(new.description, ''),
    new.file_name,
    COALESCE(json_extract(new.metadata, '$.tags'), ''),
    COALESCE(new.metadata, '{}')
  );
END;
--> statement-breakpoint
-- Trigger: remove deleted media item from FTS index (delete by rowid)
CREATE TRIGGER media_fts_delete AFTER DELETE ON media_items BEGIN
  DELETE FROM media_fts WHERE rowid = old.rowid;
END;
