const test = require('node:test');
const assert = require('node:assert');

test('returns 400 when type, title, or body is missing', async () => {
  const { onRequestPost } = await import('../functions/github-issue.js');
  const request = new Request('https://example.com/github-issue', {
    method: 'POST',
    body: JSON.stringify({ type: 'correction', title: 'x' })
  });
  const response = await onRequestPost({ request, env: { GITHUB_ISSUE_TOKEN: 'test-token' } });
  assert.strictEqual(response.status, 400);
});

test('returns 400 when type is not correction or feedback', async () => {
  const { onRequestPost } = await import('../functions/github-issue.js');
  const request = new Request('https://example.com/github-issue', {
    method: 'POST',
    body: JSON.stringify({ type: 'spam', title: 'x', body: 'y' })
  });
  const response = await onRequestPost({ request, env: { GITHUB_ISSUE_TOKEN: 'test-token' } });
  assert.strictEqual(response.status, 400);
});

test('files an issue on the configured repo with the type as a label', async () => {
  const { onRequestPost } = await import('../functions/github-issue.js');
  const originalFetch = global.fetch;
  let capturedUrl, capturedAuth, capturedBody;
  global.fetch = async (url, opts) => {
    capturedUrl  = url;
    capturedAuth = opts.headers.Authorization;
    capturedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({ id: 1 }), { status: 201 });
  };
  try {
    const request = new Request('https://example.com/github-issue', {
      method: 'POST',
      body: JSON.stringify({ type: 'feedback', title: 'Mic too small', body: 'Hard to hit with gloves' })
    });
    const response = await onRequestPost({ request, env: { GITHUB_ISSUE_TOKEN: 'test-token' } });
    assert.strictEqual(response.status, 201);
    assert.strictEqual(capturedUrl, 'https://api.github.com/repos/calebrichards208/elite-scope-app/issues');
    assert.strictEqual(capturedAuth, 'Bearer test-token');
    assert.deepStrictEqual(capturedBody.labels, ['feedback']);
    assert.strictEqual(capturedBody.title, 'Mic too small');
    assert.strictEqual(capturedBody.body, 'Hard to hit with gloves');
  } finally {
    global.fetch = originalFetch;
  }
});
