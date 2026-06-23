const test = require('node:test');
const assert = require('node:assert');
const {
  SESSION_STORAGE_KEY,
  buildSessionSnapshot,
  serializeSession,
  restoreSession
} = require('../lib/sessionStore.js');

test('SESSION_STORAGE_KEY is the expected localStorage key', () => {
  assert.strictEqual(SESSION_STORAGE_KEY, 'ec_session');
});

test('buildSessionSnapshot captures lines, notes, and jobId', () => {
  const snapshot = buildSessionSnapshot({ lines: ['Install Toilet'], notes: 'Note one', jobId: 'job-1' });
  assert.deepStrictEqual(snapshot, { lines: ['Install Toilet'], notes: 'Note one', jobId: 'job-1' });
});

test('serializeSession produces valid JSON round-trippable by restoreSession', () => {
  const snapshot = buildSessionSnapshot({ lines: ['A', 'B'], notes: '', jobId: null });
  const json = serializeSession(snapshot);
  const restored = restoreSession(json);
  assert.deepStrictEqual(restored, snapshot);
});

test('restoreSession returns null for missing input', () => {
  assert.strictEqual(restoreSession(null), null);
  assert.strictEqual(restoreSession(undefined), null);
  assert.strictEqual(restoreSession(''), null);
});

test('restoreSession returns null for malformed JSON instead of throwing', () => {
  assert.strictEqual(restoreSession('{not valid json'), null);
});

test('restoreSession returns null when shape is wrong (lines not an array)', () => {
  assert.strictEqual(restoreSession(JSON.stringify({ lines: 'nope', notes: '', jobId: null })), null);
});
