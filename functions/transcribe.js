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

    // OpenAI's API decodes by the filename's extension, so it has to match
    // what was actually recorded — the browser names the file accordingly
    // (e.g. clip.mp4 on Safari, which can't record webm), and that name
    // survives the multipart upload on the File object here. Hardcoding
    // "clip.webm" regardless of the real format caused transcription to
    // fail with a "file might be corrupt" error on Safari specifically.
    const upstreamForm = new FormData();
    upstreamForm.append('file', audio, audio.name || 'clip.webm');
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
