/**
 * Build the committed legacy fixture database.
 *
 * `scripts/migrate/fixtures/legacy.sqlite3` is a test input, and this is how it is
 * made, so the fixture can be regenerated rather than trusted.
 *
 * It is built from the *real* legacy schema rather than a simplified one, and it
 * deliberately contains the cases the user's own database does not have: a NULL
 * awards type, an unreadable start date, an achievement with no job, a double
 * escaped story, and the orphaned `responsibilities` table the migration must
 * refuse to read (L17). A fixture that only contained the cases that happen to
 * occur would leave the transformation untested exactly where it is most likely to
 * be wrong.
 *
 * Run: `node scripts/migrate/build-fixture.mjs`
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The directory this script lives in.
const root = resolve(import.meta.dirname)
const outDir = resolve(root, 'fixtures')
const out = resolve(outDir, 'legacy.sqlite3')

rmSync(out, { force: true })
mkdirSync(outDir, { recursive: true })

const db = new DatabaseSync(out)

db.exec(`
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
CREATE TABLE responsibilities (
  responsibility_id INTEGER PRIMARY KEY, job_id INTEGER,
  creation_date TEXT NOT NULL, last_update_date TEXT NOT NULL,
  responsibilities BLOB, obsolete INTEGER
);
CREATE TABLE responsibilities_hist (
  responsibility_id INTEGER, job_id INTEGER, creation_date TEXT,
  last_update_date TEXT, responsibilities BLOB, obsolete INTEGER
);
`)

const now = '2024-06-01 09:00:00'
const then = '2018-04-08 10:00:00'

// Header: two profiles, as the legacy app seeded them.
db.prepare(
  'INSERT INTO header (header_id,name,last_update_date,creation_date,title,email,address,phone,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(
  1,
  'international',
  now,
  then,
  'CURRICULUM VITAE - Test Person',
  'int@example.com',
  '2 Foo St\nWellington',
  '+64 21 000 000',
  0,
)
db.prepare(
  'INSERT INTO header (header_id,name,last_update_date,creation_date,title,email,address,phone,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(
  2,
  'domestic',
  now,
  then,
  'CURRICULUM VITAE - Test Person',
  'dom@example.com',
  '1 Bar Rd\nAuckland',
  '+64 21 111 111',
  0,
)

// Jobs: one normal role, one current role, one question category, and one with a
// date that will not parse — the case L5 turned into a 500.
db.prepare(
  'INSERT INTO jobs (job_id,creation_date,last_update_date,start_date,end_date,company,job_title,responsibilities,job_story,obsolete,questions) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
).run(
  1,
  then,
  now,
  '20200101',
  '20240131',
  'Acme Ltd',
  'Engineer',
  'Built things.',
  'It was a good year.',
  0,
  0,
)
db.prepare(
  'INSERT INTO jobs (job_id,creation_date,last_update_date,start_date,end_date,company,job_title,responsibilities,job_story,obsolete,questions) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
).run(2, then, now, '20240201', '', 'Beta Co', 'Later Role', null, null, 0, 0)
db.prepare(
  'INSERT INTO jobs (job_id,creation_date,last_update_date,start_date,end_date,company,job_title,responsibilities,job_story,obsolete,questions) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
).run(3, then, now, 'sometime around 2020', null, 'Gamma Co', 'Broken Role', null, null, 0, 0)
// A question category: the company becomes the title, the story survives, and the
// title and dates are discarded (D19).
db.prepare(
  'INSERT INTO jobs (job_id,creation_date,last_update_date,start_date,end_date,company,job_title,responsibilities,job_story,obsolete,questions) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
).run(
  10,
  then,
  now,
  '19990101',
  '20240131',
  'Interview Questions',
  'Behavioural',
  null,
  'Questions about the interview itself.',
  0,
  1,
)

db.prepare(
  'INSERT INTO achievements (achievement_id,creation_date,last_update_date,job_id,achievement,story,obsolete) VALUES (?,?,?,?,?,?,?)',
).run(1, then, now, 1, 'Shipped the thing', 'A normal story.', 0)
db.prepare(
  'INSERT INTO achievements (achievement_id,creation_date,last_update_date,job_id,achievement,story,obsolete) VALUES (?,?,?,?,?,?,?)',
).run(2, then, now, 10, 'Why are you leaving?', 'Because of the thing.', 0)
// No parent at all: attached to the highest-numbered real job, and reported.
db.prepare(
  'INSERT INTO achievements (achievement_id,creation_date,last_update_date,job_id,achievement,story,obsolete) VALUES (?,?,?,?,?,?,?)',
).run(3, then, now, null, 'An orphan', null, 1)
// Double-escaped: the legacy app re-escaped on every save, so some rows carry two
// levels (L6). Decoding twice would corrupt it.
db.prepare(
  'INSERT INTO achievements (achievement_id,creation_date,last_update_date,job_id,achievement,story,obsolete) VALUES (?,?,?,?,?,?,?)',
).run(4, then, now, 1, 'Tom&#039;s &amp; win', null, 0)
// Blank text: nothing to show.
db.prepare(
  'INSERT INTO achievements (achievement_id,creation_date,last_update_date,job_id,achievement,story,obsolete) VALUES (?,?,?,?,?,?,?)',
).run(5, then, now, 1, '', '', 0)

// Awards and education: an explicit award, an explicit education, a NULL type
// that resolves to education, a NULL type that does not, and a year of "None".
db.prepare(
  'INSERT INTO awards_edu (award_edu_id,creation_date,last_update_date,type,date,institution,what,story,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(1, then, now, 'award', '2007', 'Arrow Components', "President's Club", null, 0)
db.prepare(
  'INSERT INTO awards_edu (award_edu_id,creation_date,last_update_date,type,date,institution,what,story,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(2, then, now, 'education', '2017', 'Victoria University', 'Visual BI', null, 0)
db.prepare(
  'INSERT INTO awards_edu (award_edu_id,creation_date,last_update_date,type,date,institution,what,story,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(
  3,
  then,
  now,
  null,
  '1999',
  'University of Auckland',
  'Bachelor of Engineering (Hons)',
  null,
  0,
)
db.prepare(
  'INSERT INTO awards_edu (award_edu_id,creation_date,last_update_date,type,date,institution,what,story,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(4, then, now, null, '2004', 'Some Body', 'A prize of some kind', null, 0)
db.prepare(
  'INSERT INTO awards_edu (award_edu_id,creation_date,last_update_date,type,date,institution,what,story,obsolete) VALUES (?,?,?,?,?,?,?,?,?)',
).run(5, then, now, 'award', 'None', 'None', 'None', 'None', 1)

db.prepare('INSERT INTO db_version (version,timestamp) VALUES (2, ?)').run(now)
db.prepare('INSERT INTO db_version_hist (version,timestamp) VALUES (1, ?)').run(then)
db.prepare(
  'INSERT INTO month_translation (month_translation_id,month_number,month_short_name) VALUES (1,?,?)',
).run(1, 'Jan')
db.prepare('INSERT INTO region (region) VALUES (?)').run('domestic')
db.prepare(
  'INSERT INTO responsibilities (responsibility_id,job_id,creation_date,last_update_date,responsibilities,obsolete) VALUES (1,1,?,?,?,?)',
).run(then, now, 'Orphaned by L17.', 0)

db.close()

// A .sql sibling so the fixture is readable without a database tool.
writeFileSync(
  resolve(outDir, 'schema.sql'),
  `-- The legacy schema, as it existed at the point of migration.
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
`,
)

console.log(`Wrote ${out}`)
