// Primes gpt-4o-transcribe's recognition of trade jargon that's otherwise
// easy to mishear (e.g. "Furnish and Install" -> "Furnishing"). Per OpenAI's
// guidance for this model, keep it a short vocabulary/context hint rather
// than an instruction list — that's RULES.md's job, applied in the separate
// AI review pass. Extend this line as new mishearings turn up.
const TRANSCRIPTION_VOCAB_HINT =
  'A contractor is dictating a construction scope-of-work line item. Common phrases: ' +
  'Furnish and Install, Install Owner Provided, Remove and Replace, Owner to Pay Electrician Directly, ' +
  'Owner to Pay Plumber Directly. Common terms: Durock, Green Board, Sheetrock, OSB, LVP, LVT, joists, ' +
  'sistering, rim joist, headers, blocking, niche, vanity, shower valve, shower pan. ' +
  'Measurements are written in shorthand, not spelled out: 2x4, 2x6x8, 12", 6\', 5\'6".';

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
    upstreamForm.append('prompt', TRANSCRIPTION_VOCAB_HINT);

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
