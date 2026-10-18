-- The legacy schema, as it existed at the point of migration.
--
-- Committed alongside the fixture so the fixture can be checked without opening a
-- database. The tables the migration reads are header, jobs, achievements and
-- awards_edu; everything else here is what it deliberately refuses to touch.

CREATE TABLE header (
  header_id INTEGER PRIMARY KEY,
  name TEXT,
  last_update_date TEXT NOT NULL,
  creation_date TEXT NOT NULL,
  title TEXT,
  email TEXT,
  address TEXT,
  phone TEXT,
  obsolete INTEGER
);

CREATE TABLE region (region TEXT);

CREATE TABLE jobs (
  job_id INTEGER PRIMARY KEY,
  creation_date timestamp NOT NULL,
  last_update_date timestamp NOT NULL,
  start_date TEXT,
  end_date TEXT,
  company TEXT,
  job_title TEXT,
  responsibilities BLOB,
  job_story BLOB,
  obsolete INTEGER NOT NULL,
  questions boolean
);

CREATE TABLE achievements (
  achievement_id INTEGER PRIMARY KEY,
  creation_date TEXT NOT NULL,
  last_update_date TEXT NOT NULL,
  job_id INTEGER,
  achievement TEXT,
  story TEXT,
  obsolete INTEGER
);

CREATE TABLE awards_edu (
  award_edu_id INTEGER PRIMARY KEY,
  creation_date TEXT NOT NULL,
  last_update_date TEXT NOT NULL,
  type TEXT,
  date TEXT,
  institution TEXT,
  what TEXT,
  story BLOB,
  obsolete INTEGER
);

CREATE TABLE db_version (version INTEGER NOT NULL, timestamp TEXT);
CREATE TABLE db_version_hist (version INTEGER, timestamp TEXT);
CREATE TABLE month_translation (
  month_translation_id INTEGER PRIMARY KEY,
  month_number TEXT,
  month_short_name TEXT NOT NULL
);
CREATE TABLE achievements_hist (
  achievement_id INTEGER, creation_date TEXT, last_update_date TEXT,
  job_id INTEGER, achievement TEXT, story TEXT, obsolete INTEGER
);
CREATE TABLE jobs_hist (
  job_id INTEGER, creation_date timestamp, last_update_date timestamp,
  start_date TEXT, end_date TEXT, company TEXT, job_title TEXT,
  responsibilities BLOB, job_story BLOB, obsolete INTEGER, questions boolean
);
CREATE TABLE header_hist (header_id INTEGER);
CREATE TABLE region_hist (region TEXT);
CREATE TABLE awards_edu_hist (
  award_edu_id INTEGER, creation_date TEXT, last_update_date TEXT,
  type TEXT, date TEXT, institution TEXT, what TEXT, story BLOB, obsolete INTEGER
);

-- Orphaned and deliberately refused (L17).
CREATE TABLE responsibilities (
  responsibility_id INTEGER PRIMARY KEY, job_id INTEGER,
  creation_date TEXT NOT NULL, last_update_date TEXT NOT NULL,
  responsibilities BLOB, obsolete INTEGER
);
CREATE TABLE responsibilities_hist (
  responsibility_id INTEGER, job_id INTEGER, creation_date TEXT,
  last_update_date TEXT, responsibilities BLOB, obsolete INTEGER
);
