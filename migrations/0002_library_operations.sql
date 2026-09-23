-- Retain receipts after link deletion so retries cannot recreate a deleted item.
-- Payloads are hashed. Private notes are not duplicated in this table.
CREATE TABLE library_operations (
  request_id TEXT PRIMARY KEY CHECK(length(request_id) BETWEEN 8 AND 128),
  payload_hash TEXT NOT NULL,
  link_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('created','existing','merged','appended','tagged')),
  created_at TEXT NOT NULL
);
