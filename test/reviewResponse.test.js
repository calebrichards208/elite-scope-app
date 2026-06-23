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

test('REVIEW_TOOL requires lines and notes in its input schema', () => {
  assert.strictEqual(REVIEW_TOOL.name, 'record_reviewed_lines');
  assert.deepStrictEqual(REVIEW_TOOL.input_schema.required, ['lines', 'notes']);
});

test('parseReviewToolInput returns trimmed lines and notes on a valid response', () => {
  const result = parseReviewToolInput({
    lines: [
      { text: 'Install New Toilet ', flagged: false, reason: '' },
      { text: 'Sister the Joists in Bathroom Floor', flagged: true, reason: 'Heard "Joyce" — assumed structural framing' }
    ],
    notes: [' Owner to pay electrician directly ']
  }, 2);
  assert.deepStrictEqual(result, {
    lines: [
      { text: 'Install New Toilet', flagged: false, reason: '' },
      { text: 'Sister the Joists in Bathroom Floor', flagged: true, reason: 'Heard "Joyce" — assumed structural framing' }
    ],
    notes: ['Owner to pay electrician directly']
  });
});

test('parseReviewToolInput defaults reason to empty string when not flagged', () => {
  const result = parseReviewToolInput({
    lines: [{ text: 'Install Toilet', flagged: false, reason: 'should be ignored' }],
    notes: []
  }, 1);
  assert.strictEqual(result.lines[0].reason, '');
});

test('parseReviewToolInput throws on line count mismatch', () => {
  assert.throws(
    () => parseReviewToolInput({ lines: [{ text: 'a', flagged: false, reason: '' }], notes: [] }, 2),
    /Scope line count mismatch/
  );
});

test('parseReviewToolInput throws on malformed input', () => {
  assert.throws(() => parseReviewToolInput({}, 1), /Malformed AI response/);
  assert.throws(() => parseReviewToolInput(null, 1), /Malformed AI response/);
});
