function buildCorrectionIssue({ aiReturned, correctedTo, reason }) {
  return {
    type: 'correction',
    title: `Correction: "${aiReturned}" -> "${correctedTo}"`,
    body: [
      `**AI returned:** ${aiReturned}`,
      `**Corrected to:** ${correctedTo}`,
      reason ? `**Flag reason:** ${reason}` : null
    ].filter(Boolean).join('\n')
  };
}

function buildFeedbackIssue({ transcript }) {
  const title = transcript.length > 60 ? `Feedback: ${transcript.slice(0, 60)}…` : `Feedback: ${transcript}`;
  return {
    type: 'feedback',
    title,
    body: transcript
  };
}

if (typeof module !== 'undefined') {
  module.exports = { buildCorrectionIssue, buildFeedbackIssue };
}
