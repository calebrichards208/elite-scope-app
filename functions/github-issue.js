export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { type, title, body } = await request.json();

    if (!type || !title || !body) {
      return new Response(JSON.stringify({ error: 'Missing type, title, or body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (type !== 'correction' && type !== 'feedback') {
      return new Response(JSON.stringify({ error: 'type must be "correction" or "feedback"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const upstream = await fetch('https://api.github.com/repos/calebrichards208/elite-scope-app/issues', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${env.GITHUB_ISSUE_TOKEN}`,
        'Accept':         'application/vnd.github+json',
        'Content-Type':   'application/json',
        'User-Agent':     'elite-scope-app'
      },
      body: JSON.stringify({ title, body, labels: [type] })
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
