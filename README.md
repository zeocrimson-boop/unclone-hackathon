# EchoGuard

**Hear the voice. Uncover the risk.**

An Express + vanilla HTML/CSS/JavaScript investigation workspace for UNCLONE AI:

- **Voice analysis:** upload an authorized recording; the server calls DetectifAI
  when configured. Real, synthetic and inconclusive provider verdicts stay separate
  from fraud judgments. No automatic transcription.
- **Text scam detector:** paste messages, offers, emails or manually obtained
  transcripts. Local, transparent English-language rules return qualitative
  findings, verbatim evidence and verification steps. No external text API or
  numerical scam probability.
- **Community phone reports:** search actual PostgreSQL aggregates and submit
  unverified experiences. No reverse lookups, invented reports or public raw
  descriptions. Phone reports never identify a confirmed scammer.

This continues the application copied from `zeocrimson-boop/lets-try` at commit
`deef8f325cc5d20eec04f36585eab7f2892d0995`. The source was left unchanged; this
project is maintained separately in `zeocrimson-boop/unclone-hackathon`.

## Run locally

Use Node.js 22.19 or newer (see `.node-version`). From the repository root:

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3000` in your own local browser. `npm run dev` restarts the
server while editing. No frontend build step is required. Never commit `.env` or
credentials. The example has no secret values.

Text analysis works immediately. Without optional credentials, voice displays its
configuration message and community search/reporting displays unavailable. Neither
returns fabricated results. Read [API_SETUP.md](API_SETUP.md) for the verified
provider contract, database configuration and route details.

## Configure community reporting

Install/start PostgreSQL locally or choose a hosted PostgreSQL-compatible service.
Review current plan costs, storage, backups and limits before creating a paid
resource. Nothing in this repository automatically provisions or bills a database.

For an already running local PostgreSQL server, create a database using your normal
local database role:

```bash
createdb echoguard
```

Set `DATABASE_URL` in `.env` to its connection string and add a private
`REPORT_ABUSE_SECRET` of at least 32 characters. Generate the latter locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep that output private, put it in `.env` or hosting secret settings, then run:

```bash
npm run db:migrate
npm start
```

The secret is a local HMAC key, not an external API token. Reports persist in
PostgreSQL across requests and application restarts. Repeating the migration is
safe. Search requires an international number beginning with `+` and its country
code. No reports found never means safe. Review requests go to an operator queue;
an authorized operator must handle it as described in API_SETUP.md.

## Configure DetectifAI

Set `DETECTIF_API_KEY` securely on the server. The documented endpoint is
`https://platform.detectif.ai/v1/deepfake/detect`, configured with
`DETECTIF_DEEPFAKE_URL`. The key needs `deepfake:detect` permission, account
verification and credits. Use WAV, MP3 or M4A, longer than 4 seconds and at most
120 seconds, up to EchoGuard's stricter 10 MB limit. Other formats supported by the
provider are not yet accepted by this app.

Official documentation and request/response schemas were verified during this
upgrade. **A real detection request has not been tested without an account key.**
No service availability or accuracy claim is inferred from unit tests. Review
provider pricing and privacy terms before sending a recording. No transcription
API, extra text API or speaker identity matching is required or implemented.

## How text assessment works

`services/scam-analysis.js` retains and extends the original rules. It evaluates
contextual combinations covering employment fees, credentials, banking/UPI,
identity/KYC, investment/advance fees, prizes/refunds, delivery, remote support,
authority impersonation, emotional coercion, links and attachments. Common
protective advice and educational clauses are distinguished from demands; quoted
scam demands are explained as reported context. Rules and internal triage weights
are editable and tested, not a trained AI model.

Outcomes are:

- **Likely a scam** — strong contextual warning signs.
- **Suspicious — verify first** — meaningful but inconclusive indicators.
- **Mostly not a scam based on the text provided** — no strong warning signs;
  this does not prove safety.
- **Not enough information** — short or incomplete context.

Rules cannot recognize every scam. Other languages, unusual phrasing, sarcasm,
negation and quotes may be missed or misinterpreted. Never rely on the assessment
alone. Voice, text and community signals remain independent and are never merged
into a score. A failed text request clears a previous text assessment so it cannot
appear to be the new result.

## Tests

```bash
npm test
npm run check
npm audit --omit=dev
npx playwright install chromium
npm run test:browser
```

If Chromium is already installed, use
`BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:browser` on Linux. The browser
script runs forms, upload validation, service failures, independent results, safe
rendering, four viewport widths and automated WCAG checks. Automated scans do not
replace manual accessibility review.

The optional real PostgreSQL integration check needs a disposable database with
schema-creation permission and Chromium:

```bash
TEST_DATABASE_URL='postgresql://localhost/echoguard_test' npm run test:db
```

It creates a unique schema, runs migrations twice, tests real reporting/search,
duplicates, persistence across app/pool restart, visibility moderation, private
text, persistent rate caps and browser report/review forms. It drops only its own
test schema. No real provider calls are needed. Do not use a production database
for development tests. See [docs/VALIDATION.md](docs/VALIDATION.md) for checks
actually executed and their limits.

## Deploy to Render

1. Push this destination repository and connect **unclone-hackathon** to Render.
2. Create a Node Web Service, using the included `render.yaml` or these settings:
   build `npm ci --omit=dev`, start `npm start`, health path `/api/health`.
3. Select a current Node 22.19+ runtime. The server listens on Render's `PORT`.
   Set `TRUST_PROXY_HOPS=1` for Render's direct proxy; verify the proxy chain if
   you put another proxy in front. Incorrect trust settings undermine rate limits.
4. Optional voice: set the DetectifAI key and endpoint in Render's secret settings.
5. Optional reports: provision PostgreSQL after reviewing costs, set its
   `DATABASE_URL` and a private `REPORT_ABUSE_SECRET`, then run `npm run db:migrate`
   against that database (through an authorized shell or locally with its secure
   connection settings). Restart the web service after setting variables.
6. Check process health, submit a text example, verify a real authorized voice
   request and submit/search a test number in a non-production database before
   enabling those services publicly. Delete testing submissions before launch.

`render.yaml` keeps the existing single Express service architecture. It does not
create a paid database. Free plans may sleep or expire and have changing quotas;
check the provider's current terms. No Render deployment was performed here.

## Privacy and limitations

EchoGuard does not permanently store recordings or pasted text. Audio is bounded
in memory and its request buffer cleared after processing; a configured DetectifAI
receives the recording and has its own data policies. Community numbers, private
descriptions, categories and times are stored in PostgreSQL. Rotating connection
hashes support rate limits without storing raw IP addresses. Shared connections
can share limits. The operator must define retention, backups, support contacts
and a moderation process before public launch. See `/about.html` for the user
notice. This is a hackathon prototype, not a guarantee of production readiness.

## Troubleshooting

- **Voice unavailable:** verify server-side key/endpoint, restart, check scope and
  credits. Do not put keys into browser code or paste them into chat.
- **Voice rejected:** choose clear supported audio within size/duration limits.
- **Community unavailable:** check both database URL and abuse secret, run migration,
  verify connectivity and managed TLS settings. An unavailable service is not an
  empty database.
- **429:** wait for the minute or hourly submission window. Duplicate attempts also
  use submission limits. Do not reset the service to bypass limits.
- **Text looks harmless despite a suspicious story:** include the actual demand
  and surrounding context. Rules can miss unfamiliar patterns; verify independently.
- **Port in use:** stop your own old process or choose a different `PORT`.

## Sources and licensing

Preserved third-party upload-code provenance is in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[licenses/ai-voice-detector-MIT.txt](licenses/ai-voice-detector-MIT.txt).
[docs/REFERENCE_REVIEW.md](docs/REFERENCE_REVIEW.md) records inspection and the
classification defect. No TensorFlow, model artifacts, reference accuracy claims,
stock assets or third-party watermarks are shipped. Confirm hackathon reuse and
pre-event-work rules with the organizers and disclose the existing code and tools.
