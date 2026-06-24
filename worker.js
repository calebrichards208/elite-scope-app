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

    return env.ASSETS.fetch(request);
  }
};
