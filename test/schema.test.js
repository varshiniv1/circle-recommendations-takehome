import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadData } from '../src/data/load-data.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const data = loadData();

function tableColumns(tableName) {
  const match = new RegExp(`CREATE TABLE ${tableName} \\(([\\s\\S]*?)\\n\\) STRICT;`).exec(schema);
  assert.ok(match, `schema must define ${tableName}`);
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|REFERENCES)/.test(line))
    .map((line) => /^([a-z0-9_]+)/.exec(line)?.[1])
    .filter(Boolean);
}

function sorted(values) {
  return [...values].sort();
}

test('schema tables and columns match the normalized JSON loader model', () => {
  assert.deepEqual(sorted(tableColumns('topics')), sorted(Object.keys(data.topics[0])));
  assert.deepEqual(
    sorted(tableColumns('users')),
    sorted(Object.keys(data.users[0]).filter((field) => field !== 'topic_interests')),
  );
  assert.deepEqual(
    sorted(tableColumns('circles')),
    sorted(Object.keys(data.circles[0])
      .filter((field) => !['topic', 'tags'].includes(field))
      .concat('topic_id')),
  );
  assert.deepEqual(sorted(tableColumns('memberships')), sorted(Object.keys(data.memberships[0])));
  assert.deepEqual(sorted(tableColumns('activity')), sorted(Object.keys(data.activity[0])));
  assert.deepEqual(sorted(tableColumns('user_topic_interests')), ['position', 'topic_id', 'user_id']);
  assert.deepEqual(sorted(tableColumns('circle_tags')), ['circle_id', 'position', 'topic_id']);
});

test('schema preserves loader enums and relational constraints', () => {
  for (const value of ['in_person', 'virtual', 'hybrid', 'public', 'unlisted', 'open', 'request', 'member', 'leader']) {
    assert.match(schema, new RegExp(`'${value}'`));
  }
  assert.match(schema, /PRAGMA foreign_keys = ON/);
  assert.match(schema, /PRIMARY KEY \(user_id, circle_id\)/);
  assert.match(schema, /FOREIGN KEY \(author_user_id, circle_id\)[\s\S]*REFERENCES memberships\(user_id, circle_id\)/);
});
