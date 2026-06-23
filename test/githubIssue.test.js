const test = require('node:test');
const assert = require('node:assert');
const { buildCorrectionIssue, buildFeedbackIssue } = require('../lib/githubIssue.js');

test('buildCorrectionIssue includes the AI text, correction, and reason', () => {
  const issue = buildCorrectionIssue({
    aiReturned: 'Sister the Joists in Bathroom Floor',
    correctedTo: 'Sister the Joints in Bathroom Floor',
    reason: 'Heard "Joyce" — assumed structural framing'
  });
  assert.strictEqual(issue.type, 'correction');
  assert.match(issue.title, /Sister the Joists in Bathroom Floor/);
  assert.match(issue.title, /Sister the Joints in Bathroom Floor/);
  assert.match(issue.body, /\*\*AI returned:\*\* Sister the Joists in Bathroom Floor/);
  assert.match(issue.body, /\*\*Corrected to:\*\* Sister the Joints in Bathroom Floor/);
  assert.match(issue.body, /\*\*Flag reason:\*\* Heard "Joyce"/);
});

test('buildCorrectionIssue omits the reason line when there is no reason', () => {
  const issue = buildCorrectionIssue({ aiReturned: 'A', correctedTo: 'B', reason: '' });
  assert.doesNotMatch(issue.body, /Flag reason/);
});

test('buildFeedbackIssue uses the full transcript as the body', () => {
  const issue = buildFeedbackIssue({ transcript: 'The mic button is too small to hit reliably while wearing gloves' });
  assert.strictEqual(issue.type, 'feedback');
  assert.strictEqual(issue.body, 'The mic button is too small to hit reliably while wearing gloves');
});

test('buildFeedbackIssue truncates long transcripts in the title only', () => {
  const longTranscript = 'a'.repeat(100);
  const issue = buildFeedbackIssue({ transcript: longTranscript });
  assert.ok(issue.title.length < 80);
  assert.strictEqual(issue.body, longTranscript);
});
