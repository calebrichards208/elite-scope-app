const SESSION_STORAGE_KEY = 'ec_session';

function buildSessionSnapshot({ lines, notes, jobId }) {
  return {
    lines: Array.isArray(lines) ? [...lines] : [],
    notes: typeof notes === 'string' ? notes : '',
    jobId: jobId || null
  };
}

function serializeSession(snapshot) {
  return JSON.stringify(snapshot);
}

function restoreSession(json) {
  if (!json) return null;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.lines)) return null;
  if (typeof parsed.notes !== 'string') return null;
  if (parsed.jobId !== null && typeof parsed.jobId !== 'string') return null;
  return { lines: parsed.lines, notes: parsed.notes, jobId: parsed.jobId };
}

if (typeof module !== 'undefined') {
  module.exports = { SESSION_STORAGE_KEY, buildSessionSnapshot, serializeSession, restoreSession };
}
