import { onRequestPost as handleTranscribe } from './functions/transcribe.js';
import { onRequestPost as handleGithubIssue } from './functions/github-issue.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/transcribe') {
      return handleTranscribe({ request, env });
    }
    if (request.method === 'POST' && url.pathname === '/github-issue') {
      return handleGithubIssue({ request, env });
    }

    // Cloudflare serves real files before this worker runs, so reaching here
    // means the file is missing or hidden by .assetsignore. There is no ASSETS
    // binding in wrangler.jsonc; calling it crashed every miss into a 500.
    return new Response('Not found', { status: 404 });
  }
};
