# Elite Scope App v2 — AI Layer Rebuild — Design

Date: 2026-06-23
Status: Approved for planning

## Context

See `PROJECT_BRIEF.md` for full background. Summary: Sergey dictates construction
scope lines by voice into this app; it cleans them up and pushes them to JobTread
as a cost-group exhibit. The JobTread integration, deterministic phrase-correction
rules, and clean editable line-list UI all work and are kept as-is. The AI layer
(transcription + cleanup) is the weak point being rebuilt.

The app is a single `index.html` in a GitHub repo, auto-deployed by Cloudflare
Pages on push. No other backend exists today. v2 stays in this same repo and
deploys to the same site/URL — no migration step for Sergey.

## Scope decisions from discovery

These came out of brainstorming and materially narrow what the original brief
sketched:

- **No live conversational agent.** The brief's "multi-turn Claude agent that can
  interrupt and ask clarifying questions mid-speech" is explicitly out of scope
  for v2. Confirmed reasons: Sergey dictates at home/office, not rushed on a job
  site; the actual root cause of today's pain is transcription *quality*, not
  absence of dialogue. Revisit only if real-world use after v2 still shows a need.
- **No per-line "tap to re-record" UX change.** Existing fix mechanisms (delete +
  redictate, select word + replace) stay as-is. Worth testing later, not now.
- Everything else in "What already works" in the brief (JobTread integration,
  phrase-correction rules, change-order data model) is untouched.

## Architecture overview

```
Browser (index.html)
  ├─ MediaRecorder captures audio on mic hold
  ├─ POST clip → /functions/transcribe.js (Cloudflare Pages Function)
  │     └─ forwards to OpenAI gpt-4o-transcribe, returns transcript text
  ├─ Claude API (direct, existing pattern) → review pass, returns structured
  │     JSON with corrections + ambiguity flags
  ├─ RULES.md (fetched at load) → injected into the Claude review prompt
  └─ POST correction/feedback → /functions/github-issue.js (Cloudflare Pages Function)
        └─ files a GitHub Issue on this repo (label: correction | feedback)
```

Two new Cloudflare Pages Functions, both thin relays, both living in
`/functions/` in this same repo, both auto-deployed with the site:

1. **`transcribe.js`** — receives an audio blob + the user's OpenAI key (sent
   from Settings, forwarded only, never stored server-side). Calls OpenAI's
   transcription endpoint, returns the transcript. Required because OpenAI (like
   every viable STT provider) blocks direct browser calls for key security —
   same reason the JobTread proxy was documented (but never actually needed,
   since JobTread allows direct calls).
2. **`github-issue.js`** — receives `{type: 'correction' | 'feedback', title,
   body}` from the browser, files a GitHub Issue on this repo using a GitHub
   token. This token is a **server-side secret** (a Cloudflare Pages environment
   variable set once in the Cloudflare dashboard by whoever administers
   deploys), not a per-device Settings field — it's deploy-level config, not
   something Sergey ever sees or enters.

## Capture flow (transcription)

- Mic button keeps its current hold-to-talk / release-to-finish gesture.
- Internally: `MediaRecorder` replaces `webkitSpeechRecognition`, capturing the
  full press-to-release clip instead of streaming live partial text.
- On release: a short "Transcribing…" state replaces the old live-partial-text
  display (confirmed acceptable — no rush, he's at the office, not job site).
- Clip uploads to `/functions/transcribe.js`; the returned text inserts exactly
  where the old transcript would have landed (cursor position if a line is
  active, new line at the bottom otherwise) — same downstream insertion logic
  as today, just fed from a different source.
- Provider: OpenAI `gpt-4o-transcribe` (~$0.006/min).

## Review pass (cleanup + ambiguity flagging)

- Still one Claude call over the whole line list (extends the existing
  `reviewWithAI()`), not a separate pass — one place to maintain correction
  logic.
- **Rules move to `RULES.md`** in the repo (currently hardcoded inline in the
  `reviewWithAI()` prompt string). At app load, the app fetches `RULES.md` and
  injects its contents into the Claude system prompt. Editing this file changes
  AI behavior with no JS code changes — the same mechanism by which the rule set
  gets smarter over time (see Feedback Loop below).
- **Output format changes from plain numbered-list text to structured JSON**
  (one object per line: `{text, flagged, reason}`), via Claude tool-use /
  structured output. More reliable than today's line-count-based text parsing,
  and lets a line carry a "why I'm unsure" reason.
- Deterministic phrase corrections (furnish and install, Durock, etc.) still
  apply automatically, exactly as today. Flagging is reserved for genuinely
  ambiguous mishearings (e.g. "Joyce" outside a clearly structural context) that
  shouldn't be silently guessed.
- Flagged lines render distinctly in the existing line-list UI (e.g. amber
  border + the reason shown inline below the line). This is advisory only —
  doesn't block pushing to JobTread. Confirm-before-push stays unchanged.

## Feedback loop (rules get smarter over time)

Two capture channels, both filing GitHub Issues on this repo via
`github-issue.js`, both reviewed later in a deliberate maintenance pass — **the
live app never edits its own rules**. Keeping this boundary firm is what keeps
in-session behavior stable and debuggable:

1. **Automatic correction logging** — when a flagged line gets corrected, or a
   line gets manually edited right after the AI pass touched it, the app files
   an issue labeled `correction` with `{heard, AI returned, corrected to}`.
2. **Manual feedback button** — a small persistent button (near Settings) lets
   Sergey hold-to-talk freeform feedback about anything: a mishearing pattern,
   a UI annoyance, a "don't do X next time," a UI wish. Same transcription
   pipeline as the main mic. Files an issue labeled `feedback`, with no in-app
   response or action — purely capture-and-file. This gives Sergey a direct
   channel to shape the tool, not just a passive correction log.

**Maintenance pass** (periodic, human-triggered, can be Claude-Code-assisted):
review open `correction` and `feedback` issues, identify real patterns, edit
`RULES.md` (and occasionally the UI/code) accordingly, commit, push. Cloudflare
Pages redeploys automatically — the new rule is live for everyone immediately,
no per-device update needed.

## Session persistence (gap fix)

Today, only Settings (grant key, Anthropic key) persist to `localStorage` — the
in-progress line list lives only in memory. A refresh, crash, or dead phone
loses everything, including a 1-2 hour estimate in progress. v2 fixes this:
autosave the in-progress session (lines, notes, selected job/exhibit) to
`localStorage` on every edit, restore automatically on load. Same mechanism
already used for Settings, applied to work-in-progress too.

## "Set up once, then it just works"

- **Per-device, one-time, in Settings:** grant key, Anthropic key, OpenAI key —
  all `localStorage`, all swappable, none expire, none re-prompted once saved.
  Mirrors the existing pattern exactly.
- **Deploy-level, one-time, not Sergey-facing:** the GitHub token used by
  `github-issue.js`, set once as a Cloudflare Pages environment variable by
  whoever administers the site. Survives every future deploy; only needs
  touching again if the token is rotated or repo ownership changes.

## Explicitly out of scope for v2

- Live conversational agent / mid-stream interruption.
- Per-line "tap to re-record" UX change (defer, test later).
- Any change to JobTread integration, change-order handling, or pricing model.

## Open question to verify in real use

Same as the brief's: does this fully resolve the dictation/correction
friction, or does some version of live back-and-forth turn out to still be
needed? Watch for this once Sergey is using v2, don't assume either way.
