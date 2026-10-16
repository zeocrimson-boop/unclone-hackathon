# Reference and source review

This upgrade inspected the existing application from
`zeocrimson-boop/lets-try`, commit `deef8f325cc5d20eec04f36585eab7f2892d0995`.
The destination `zeocrimson-boop/unclone-hackathon` was empty. Application files
were copied without source Git metadata, secrets, dependencies or recordings.
The destination origin was retained. No source repository changes or pushes
were made. The original Express/vanilla frontend architecture, validation,
security middleware and upload lifecycle were retained and extended.

The source had 23 passing tests, no database, an inactive DetectifAI adapter and
an unused future transcription module. The latter was removed because automatic
transcription is outside scope.

## False-safe classification defect

The original rules primarily covered recruitment. “We guarantee huge profits if
you invest now.” matched no rule and received `Low` with an internal score of 0.
All unmatched input fell through to Low, including ambiguous short messages.
This was a decision-logic defect rather than a frontend High/Low inversion.
The frontend also rendered the legacy risk code with a generic “risk” suffix.

The engine now covers broader scam categories, distinguishes insufficient text,
handles common protective/educational context, returns a qualitative classification,
and preserves verbatim evidence. Internal weights are no longer returned in the
API. A failed request cannot become a successful low-risk assessment. The client
clears a previous text result before a new request so failures do not leave an
old assessment looking like the result of the failed attempt.

## External reference

Inspected README, MIT LICENSE, `app/static/app.js`, `app/main.py`,
`app/audio_utils.py`, and `app/model_loader.py` in
`SanchiJoshi/ai-voice-detector`, commit
`138f371eb16bc78cce8e7ba4ddf8e7c1e6218278`.

It uses a browser base64 upload, FastAPI, librosa preprocessing and a Keras model
loaded at module import. The existing application already adapts its picker,
drag/drop and request lifecycle. Those MIT notices remain. No additional model,
training artifacts, TensorFlow dependencies, branding or performance claims were
copied. The reference uses a shared temporary MP3 path; EchoGuard keeps bounded
request-scoped buffers and clears them in a finally block instead. Backend-owned
provider credentials avoid entering API keys in a browser.

No local model inference or reference training was executed during this upgrade.
The reference is not the DetectifAI API and cannot establish that API's schema.
See API_SETUP.md for the independently verified official provider contract.
