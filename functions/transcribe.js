// Primes gpt-4o-transcribe's recognition of trade jargon that's otherwise
// easy to mishear (e.g. "Furnish and Install" -> "Furnishing"). Per OpenAI's
// guidance for this model, keep it a short vocabulary/context hint rather
// than an instruction list — that's RULES.md's job, applied in the separate
// AI review pass. Extend this line as new mishearings turn up.
// Written in the target style on purpose. Whisper mirrors the prompt's casing,
// so a title-case hint produces title-case transcripts that the cleanup pass
// then has to undo. Sentence case here means dictation usually lands correct
// and the cleanup pass has nothing to do.
const TRANSCRIPTION_VOCAB_HINT =
  'A contractor is dictating a construction scope-of-work line item. Write in sentence case: ' +
  'capitalize the first word only, plus brand names and acronyms. Common phrases: ' +
  'Furnish and install shower door. Install owner provided vanity. Remove and replace drywall. ' +
  'Owner to pay electrician directly. Owner to pay plumber directly. ' +
  'Brand names and acronyms always keep their capitals: Moen, Delta, Kohler, Durock, Sheetrock, ' +
  'Schluter, Hardie, Posi-Temp, LVP, LVT, OSB, MDF, PVC, PEX, GFCI, TP holder. ' +
  'Ordinary terms stay lowercase: green board, joists, sistering, rim joist, headers, blocking, ' +
  'niche, vanity, shower valve, shower pan, subfloor, baseboard. ' +
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
