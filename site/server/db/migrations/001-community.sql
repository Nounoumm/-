CREATE TABLE IF NOT EXISTS community_handouts (
  id TEXT PRIMARY KEY,
  spec_json TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  display_name TEXT,
  manage_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible', 'hidden', 'withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_handouts_visible_created ON community_handouts(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_handouts_topic ON community_handouts(topic);

CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  handout_id TEXT NOT NULL REFERENCES community_handouts(id),
  reason TEXT NOT NULL CHECK(reason IN ('copyright', 'misinformation', 'personal_data', 'other')),
  details TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved'))
);
CREATE INDEX IF NOT EXISTS community_reports_handout ON community_reports(handout_id, status);
