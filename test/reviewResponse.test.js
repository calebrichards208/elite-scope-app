const test = require('node:test');
const assert = require('node:assert');
const { buildReviewPrompt, REVIEW_TOOL, parseReviewToolInput } = require('../lib/reviewResponse.js');

test('buildReviewPrompt includes the rules text, numbered lines, and notes section', () => {
  const prompt = buildReviewPrompt({
    rulesText: 'RULES:\n1. Title case everything.',
    numbered: '1. install new toilet',
    notesSection: '\n\nADDITIONAL NOTES (fix grammar/phrasing only, keep as bullet lines):\nowner pays electrician'
  });
  assert.match(prompt, /RULES:\n1\. Title case everything\./);
  assert.match(prompt, /SCOPE LINES:\n1\. install new toilet/);
  assert.match(prompt, /owner pays electrician/);
});

test('buildReviewPrompt tells the model not to echo unchanged lines', () => {
  const prompt = buildReviewPrompt({ rulesText: 'RULES:', numbered: '1. a', notesSection: '' });
  assert.match(prompt, /ONLY the lines you actually changed or flagged/);
  assert.match(prompt, /must be omitted entirely/);
});

test('REVIEW_TOOL requires changes and notes in its input schema', () => {
  assert.strictEqual(REVIEW_TOOL.name, 'record_reviewed_lines');
  assert.deepStrictEqual(REVIEW_TOOL.input_schema.required, ['changes', 'notes']);
  assert.deepStrictEqual(
    REVIEW_TOOL.input_schema.properties.changes.items.required,
    ['index', 'text', 'flagged', 'reason']
  );
});

test('an empty changes array leaves every line untouched', () => {
  const originals = ['Install New Toilet', 'Demolish Existing Tile Shower'];
  const result = parseReviewToolInput({ changes: [], notes: [] }, originals);
  assert.deepStrictEqual(result.lines, [
    { text: 'Install New Toilet', flagged: false, reason: '' },
    { text: 'Demolish Existing Tile Shower', flagged: false, reason: '' }
  ]);
});

test('only the reported lines change; the rest are preserved verbatim', () => {
  const originals = ['Install New Toilet', 'sister the joyce in bathroom floor', 'Paint Walls'];
  const result = parseReviewToolInput({
    changes: [{ index: 2, text: 'Sister the Joists in Bathroom Floor', flagged: true, reason: 'Heard "Joyce"' }],
    notes: []
  }, originals);

  assert.strictEqual(result.lines[0].text, 'Install New Toilet');
  assert.strictEqual(result.lines[2].text, 'Paint Walls');
  assert.strictEqual(result.lines[1].text, 'Sister the Joists in Bathroom Floor');
  assert.strictEqual(result.lines[1].flagged, true);
  assert.strictEqual(result.lines[1].reason, 'Heard "Joyce"');
});

test('indexes are 1-based, matching the numbered prompt', () => {
  const result = parseReviewToolInput(
    { changes: [{ index: 1, text: 'Fixed First', flagged: false, reason: '' }], notes: [] },
    ['original first', 'second']
  );
  assert.strictEqual(result.lines[0].text, 'Fixed First');
  assert.strictEqual(result.lines[1].text, 'second');
});

test('reason is dropped when a line is not flagged', () => {
  const result = parseReviewToolInput(
    { changes: [{ index: 1, text: 'Install Toilet', flagged: false, reason: 'should be ignored' }], notes: [] },
    ['install toilet']
  );
  assert.strictEqual(result.lines[0].reason, '');
});

test('notes are trimmed and blanks dropped', () => {
  const result = parseReviewToolInput(
    { changes: [], notes: [' Owner to pay electrician directly ', '  ', ''] },
    ['a']
  );
  assert.deepStrictEqual(result.notes, ['Owner to pay electrician directly']);
});

test('an out-of-range index is rejected rather than silently dropped', () => {
  ['5', 0, -1, 99, null, undefined, 1.5].forEach(index => {
    assert.throws(
      () => parseReviewToolInput(
        { changes: [{ index, text: 'x', flagged: false, reason: '' }], notes: [] },
        ['a', 'b']
      ),
      /does not exist/
    );
  });
});

test('an empty corrected text falls back to the original line', () => {
  const result = parseReviewToolInput(
    { changes: [{ index: 1, text: '   ', flagged: false, reason: '' }], notes: [] },
    ['Install New Toilet']
  );
  assert.strictEqual(result.lines[0].text, 'Install New Toilet');
});

test('parseReviewToolInput throws on malformed input', () => {
  assert.throws(() => parseReviewToolInput({}, ['a']), /Malformed AI response/);
  assert.throws(() => parseReviewToolInput(null, ['a']), /Malformed AI response/);
  assert.throws(() => parseReviewToolInput({ changes: [], notes: [] }, null), /original lines missing/);
});
