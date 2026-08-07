const test = require('node:test');
const assert = require('node:assert');

test('returns 400 when audio or apiKey is missing', async () => {
  const { onRequestPost } = await import('../functions/transcribe.js');
  const form = new FormData();
  form.append('apiKey', 'sk-test');
  const request = new Request('https://example.com/transcribe', { method: 'POST', body: form });
  const response = await onRequestPost({ request });
  assert.strictEqual(response.status, 400);
});

test('forwards audio and apiKey to OpenAI and relays the response', async () => {
  const { onRequestPost } = await import('../functions/transcribe.js');
  const originalFetch = global.fetch;
  let capturedUrl, capturedAuth;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedAuth = opts.headers.Authorization;
    return new Response(JSON.stringify({ text: 'install new toilet' }), { status: 200 });
  };
  try {
    const form = new FormData();
    form.append('audio', new Blob(['fake-audio-bytes'], { type: 'audio/webm' }), 'clip.webm');
    form.append('apiKey', 'sk-test');
    const request = new Request('https://example.com/transcribe', { method: 'POST', body: form });
    const response = await onRequestPost({ request });
    const body = await response.json();
    assert.strictEqual(capturedUrl, 'https://api.openai.com/v1/audio/transcriptions');
    assert.strictEqual(capturedAuth, 'Bearer sk-test');
    assert.strictEqual(body.text, 'install new toilet');
  } finally {
    global.fetch = originalFetch;
  }
});

test('forwards a construction-vocabulary prompt to bias transcription accuracy', async () => {
  const { onRequestPost } = await import('../functions/transcribe.js');
  const originalFetch = global.fetch;
  let capturedForm;
  global.fetch = async (url, opts) => {
    capturedForm = opts.body;
    return new Response(JSON.stringify({ text: 'furnish and install new toilet' }), { status: 200 });
  };
  try {
    const form = new FormData();
    form.append('audio', new Blob(['fake-audio-bytes'], { type: 'audio/webm' }), 'clip.webm');
    form.append('apiKey', 'sk-test');
    const request = new Request('https://example.com/transcribe', { method: 'POST', body: form });
    await onRequestPost({ request });
    const prompt = capturedForm.get('prompt');
    assert.ok(prompt && prompt.length > 0);
    // Whisper mirrors the prompt's casing, so the hint must be written in the
    // target style — sentence case, with brands and acronyms capitalized.
    assert.match(prompt, /sentence case/i);
    assert.match(prompt, /Furnish and install/);
    assert.doesNotMatch(prompt, /Furnish and Install/);
    ['Moen', 'Durock', 'Sheetrock', 'LVP', 'OSB'].forEach(term =>
      assert.match(prompt, new RegExp(`\\b${term}\\b`)));
    assert.match(prompt, /green board/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('relays a non-200 upstream status', async () => {
  const { onRequestPost } = await import('../functions/transcribe.js');
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 });
  try {
    const form = new FormData();
    form.append('audio', new Blob(['x'], { type: 'audio/webm' }), 'clip.webm');
    form.append('apiKey', 'sk-bad');
    const request = new Request('https://example.com/transcribe', { method: 'POST', body: form });
    const response = await onRequestPost({ request });
    assert.strictEqual(response.status, 401);
  } finally {
    global.fetch = originalFetch;
  }
});
