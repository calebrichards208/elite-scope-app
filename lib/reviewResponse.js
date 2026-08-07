function buildReviewPrompt({ rulesText, numbered, notesSection }) {
  return `You are proofreading construction scope lines for Elite Construction + Remodeling (Spokane, WA). Lines are voice-dictated by a Russian-accented contractor named Sergey.

${rulesText}

Apply the rules above to every scope line. Flag a line only when a mishearing is plausible but not clearly resolvable by the rules — include a short reason. Do not flag lines that the rules already resolve confidently.

Report ONLY the lines you actually changed or flagged, each with its line number. Lines that already follow the rules must be omitted entirely — do not echo them back. If every line is already correct, return an empty changes array.

SCOPE LINES:
${numbered}${notesSection}`;
}

// Only changed or flagged lines come back, keyed by line number. Echoing every
// line made output cost and latency scale with the whole scope even when
// nothing needed fixing — and most lines usually need nothing.
const REVIEW_TOOL = {
  name: 'record_reviewed_lines',
  description: 'Records only the scope lines that were corrected or flagged, plus any additional notes.',
  input_schema: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        description: 'Only lines that were corrected or flagged. Omit lines that were already correct. Empty array if nothing needed changing.',
        items: {
          type: 'object',
          properties: {
            index:   { type: 'integer', description: 'The 1-based line number from the SCOPE LINES list.' },
            text:    { type: 'string',  description: 'The corrected line text.' },
            flagged: { type: 'boolean', description: 'True only if a mishearing is plausible but not clearly resolvable by the rules.' },
            reason:  { type: 'string',  description: 'Short reason shown to the user when flagged is true. Empty string when flagged is false.' }
          },
          required: ['index', 'text', 'flagged', 'reason']
        }
      },
      notes: {
        type: 'array',
        description: 'Cleaned additional-notes bullet lines, in order. Empty array if no notes were provided.',
        items: { type: 'string' }
      }
    },
    required: ['changes', 'notes']
  }
};

// `originalTexts` is the scope as it was sent. Anything the model did not
// report comes back untouched, so an empty changes array is a valid, cheap
// "nothing needed fixing" result.
function parseReviewToolInput(toolInput, originalTexts) {
  if (!toolInput || !Array.isArray(toolInput.changes) || !Array.isArray(toolInput.notes)) {
    throw new Error('Malformed AI response — missing changes or notes array');
  }
  if (!Array.isArray(originalTexts)) {
    throw new Error('Malformed AI response — original lines missing');
  }

  const lines = originalTexts.map(text => ({ text: String(text), flagged: false, reason: '' }));

  toolInput.changes.forEach(change => {
    const index = Number(change && change.index);
    if (!Number.isInteger(index) || index < 1 || index > lines.length) {
      throw new Error(`AI referenced line ${change && change.index}, which does not exist — check manually`);
    }
    const flagged = Boolean(change.flagged);
    const text    = String(change.text == null ? lines[index - 1].text : change.text).trim();
    lines[index - 1] = {
      text: text || lines[index - 1].text,
      flagged,
      reason: flagged ? String(change.reason || '').trim() : ''
    };
  });

  const notes = toolInput.notes.map(n => String(n).trim()).filter(Boolean);
  return { lines, notes };
}

if (typeof module !== 'undefined') {
  module.exports = { buildReviewPrompt, REVIEW_TOOL, parseReviewToolInput };
}
