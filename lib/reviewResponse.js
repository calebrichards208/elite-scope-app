function buildReviewPrompt({ rulesText, numbered, notesSection }) {
  return `You are proofreading construction scope lines for Elite Construction + Remodeling (Spokane, WA). Lines are voice-dictated by a Russian-accented contractor named Sergey.

${rulesText}

Apply the rules above to every scope line. Flag a line only when a mishearing is plausible but not clearly resolvable by the rules — include a short reason. Do not flag lines that the rules already resolve confidently.

SCOPE LINES:
${numbered}${notesSection}`;
}

const REVIEW_TOOL = {
  name: 'record_reviewed_lines',
  description: 'Records the corrected scope lines and any additional notes after applying the proofreading rules.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        description: 'One entry per input scope line, in the same order.',
        items: {
          type: 'object',
          properties: {
            text:    { type: 'string', description: 'The corrected line text.' },
            flagged: { type: 'boolean', description: 'True only if a mishearing is plausible but not clearly resolvable by the rules.' },
            reason:  { type: 'string', description: 'Short reason shown to the user when flagged is true. Empty string when flagged is false.' }
          },
          required: ['text', 'flagged', 'reason']
        }
      },
      notes: {
        type: 'array',
        description: 'Cleaned additional-notes bullet lines, in order. Empty array if no notes were provided.',
        items: { type: 'string' }
      }
    },
    required: ['lines', 'notes']
  }
};

function parseReviewToolInput(toolInput, expectedLineCount) {
  if (!toolInput || !Array.isArray(toolInput.lines) || !Array.isArray(toolInput.notes)) {
    throw new Error('Malformed AI response — missing lines or notes array');
  }
  if (toolInput.lines.length !== expectedLineCount) {
    throw new Error('Scope line count mismatch — check manually');
  }
  const lines = toolInput.lines.map(item => {
    const flagged = Boolean(item.flagged);
    return {
      text: String(item.text || '').trim(),
      flagged,
      reason: flagged ? String(item.reason || '').trim() : ''
    };
  });
  const notes = toolInput.notes.map(n => String(n).trim()).filter(Boolean);
  return { lines, notes };
}

if (typeof module !== 'undefined') {
  module.exports = { buildReviewPrompt, REVIEW_TOOL, parseReviewToolInput };
}
