export async function onRequestPost(context) {
  const { request } = context;
  try {
    const formData = await request.formData();
    const audio  = formData.get('audio');
    const apiKey = formData.get('apiKey');

    if (!audio || !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing audio or apiKey' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const upstreamForm = new FormData();
    upstreamForm.append('file', audio, 'clip.webm');
    upstreamForm.append('model', 'gpt-4o-transcribe');

    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: upstreamForm
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
