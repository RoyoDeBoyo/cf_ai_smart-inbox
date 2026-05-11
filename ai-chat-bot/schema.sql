-- schema.sql
DROP TABLE IF EXISTS inbox_items;
CREATE TABLE inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT,
  summary TEXT,
  timestamp TEXT,
  is_important BOOLEAN
);