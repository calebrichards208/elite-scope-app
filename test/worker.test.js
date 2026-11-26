const test = require('node:test');
const assert = require('node:assert');

// Cloudflare serves real files before the worker runs, so anything that
// reaches the worker's fallback is a missing or hidden file. It must answer
// 404, not crash with a 500 (11/26: a hidden RULES.md showed as "HTTP 500").
test('unknown path returns 404, not a crash', async () => {
  const { default: worker } = await import('../worker.js');
  const response = await worker.fetch(new Request('https://example.com/RULES.md'), {});
  assert.strictEqual(response.status, 404);
});

test('GET /transcribe falls through to 404', async () => {
  const { default: worker } = await import('../worker.js');
  const response = await worker.fetch(new Request('https://example.com/transcribe'), {});
  assert.strictEqual(response.status, 404);
});
