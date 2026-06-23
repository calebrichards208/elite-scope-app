# Elite Scope App v2 — Rebuild Brief

Input for a brainstorming/design session on rebuilding the AI layer of this app.
Read this alongside `index.html` (the current app) before proposing a design.

## What this app does today
Sergey (contractor, strong Russian accent, broken English) dictates construction
scope lines by voice, line by line, into this app on his phone. He picks a job
from a list pulled live from JobTread, the app loads the existing exhibit/addendum
for that job if one exists, he adds new lines, gives a lump sum total at the end,
optionally adds notes, and the app pushes everything to JobTread as a new exhibit
(cost group) with the lump sum on the last line item.

Before this app existed, Alina (office admin) did this by hand: Sergey dictated to
her in person, she typed and cleaned up his phrasing in real time, asking
clarifying questions when something was ambiguous.

## What already works — keep this
- **JobTread integration**: direct API via a per-device "grant key" pasted into
  Settings (`localStorage`). Pulls active jobs, detects existing exhibits/addenda
  on a job, writes new cost items, puts the lump sum + taxable flag on the last
  line, manages the NOTES cost item (standard boilerplate + extra notes, appended
  on later exhibits rather than duplicated). This is solid — do not rebuild it,
  do not introduce cost codes/margin/per-item pricing (that's a different system
  Caleb uses for his own bathroom estimates — Sergey already prices the whole job
  in his head and gives one number at the end).
- **Scope line phrase corrections**: a fixed rule set for title-casing and fixing
  known dictation mishearings (see the prompt in the current `reviewWithAI()`
  function, ~line 1611 of `index.html`) — e.g. "furnish and install" capitalization,
  "Joyce" → "Joists" in structural context, "dura rock" → "Durock", etc. Keep these
  rules; they're proven.

## What's broken — the actual problem
The AI layer is too "dumb" for what it needs to do:
- **Transcription**: uses the browser's free built-in `webkitSpeechRecognition`,
  which is mediocre on Sergey's accent.
- **No real conversation**: each line is captured once via push-to-record, then
  fixed afterward by a single one-shot batch call to Haiku. There's no back-and-
  forth — it can't ask "did you mean joists?" mid-stream, the way Alina did.
- **CONFIRMED pain point**: Sergey thinks out loud and revises mid-thought. He
  needs to easily edit/replace what he just said before it's locked in — not just
  append more text. This is the #1 thing observed going wrong in practice.

## What's NOT yet confirmed — don't over-build for this
- Change orders: untested. The data model already supports it (pick the job →
  load existing exhibit/addendum → add lines → push as new exhibit). Make sure
  that flow stays solid, but don't add extra UI/logic for change-order detection
  until we've actually watched Sergey do one and seen what, if anything, breaks.

## Target architecture for v2
- Swap the browser STT for a better transcription model (e.g. Whisper /
  GPT-4o-transcribe-class, ~$0.003–0.006/min — cost is a non-issue at this volume).
- Replace the one-shot Haiku cleanup with a real multi-turn conversational loop
  (Claude API with tool use) that has memory of the whole session, can ask
  clarifying questions, and lets Sergey revise/correct in real time.
- Keep the existing clean line-list UI (visible, reorderable, editable) as the
  visual anchor/confirmation layer — he should be able to see and fix what was
  captured before anything gets pushed to JobTread. Always confirm before pushing.
- Keep the existing JobTread grant-key integration as-is.

## Hard constraint — must be handoff-able
Caleb will eventually leave this business. The app must be fully ownable/runnable
by Sergey (or the business) independent of Caleb:
- Already true: JobTread access is the business's own (grant key), not personal to Caleb.
- Needs to be true: the Anthropic API key must be swappable to Sergey's/the
  business's own key (already a Settings field — just needs to actually be
  Sergey's key, not Caleb's, once live). No dependency on a claude.ai subscription
  or any account that's personally Caleb's.
- Whatever STT service gets added must follow the same pattern — its own API key,
  pay-as-you-go, swappable in Settings, not tied to Caleb's account.

## Open question to verify with Sergey before/during the rebuild
Does a real conversational flow (ask clarifying questions, easy revision) actually
match how he wants to work, or does talking *to* a tool (vs. a person) change his
behavior in ways we haven't seen yet? Watch for this when testing, don't assume.
