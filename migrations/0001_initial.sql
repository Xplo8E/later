CREATE TABLE links (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL CHECK(length(url) <= 4096),
  normalized_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK(length(title) <= 500),
  description TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'website' CHECK(kind IN ('article','video','repository','paper','website')),
  image_url TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 4000),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK(status IN ('inbox','library','finished','archived')),
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  last_opened_at TEXT,
  open_count INTEGER NOT NULL DEFAULT 0 CHECK(open_count >= 0),
  reading_minutes INTEGER,
  metadata_status TEXT NOT NULL DEFAULT 'pending' CHECK(metadata_status IN ('pending','ready','failed','skipped')),
  metadata_started_at TEXT,
  metadata_version INTEGER NOT NULL DEFAULT 0,
  title_edited INTEGER NOT NULL DEFAULT 0 CHECK(title_edited IN (0,1)),
  tags_edited INTEGER NOT NULL DEFAULT 0 CHECK(tags_edited IN (0,1))
);
CREATE INDEX idx_links_status_saved ON links(status, saved_at DESC, id DESC);
CREATE INDEX idx_links_finished ON links(finished_at DESC, id DESC) WHERE status = 'finished';

CREATE TABLE tags (name TEXT PRIMARY KEY COLLATE NOCASE CHECK(length(name) BETWEEN 1 AND 40));
CREATE TABLE link_tags (
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL COLLATE NOCASE REFERENCES tags(name) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY(link_id, tag_name),
  UNIQUE(link_id, position)
);
CREATE INDEX idx_link_tags_name ON link_tags(tag_name, link_id);

CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL CHECK(json_valid(value)));
INSERT INTO settings(id,value) VALUES(1,'{"theme":"system","defaultStatus":"inbox","fetchMetadata":true,"suggestTags":true}');

CREATE TABLE write_limits (scope TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
