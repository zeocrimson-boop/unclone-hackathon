# EchoGuard API and database setup

## DetectifAI: verified contract

Verified from official documentation on 2026-10-16:

- https://platform.detectif.ai/docs.md
- https://platform.detectif.ai/docs/api/detect-deepfake.md
- https://platform.detectif.ai/docs/audio-and-limits.md
- https://platform.detectif.ai/openapi.json

The docs agree with the supplied endpoint: **POST
`https://platform.detectif.ai/v1/deepfake/detect`**. `/v1/speakers` is not a
substitute and is never used by EchoGuard.

| Setting            | Requirement                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Authentication     | `Authorization: Bearer $DETECTIF_API_KEY`                                                   |
| Key permission     | `deepfake:detect`; verified account, sufficient credits                                     |
| Request            | `multipart/form-data`, audio field **`file`**; no other form fields required                |
| Retry identity     | `Idempotency-Key`; reused for retries of the same selected recording                        |
| Duration           | Longer than 4 seconds, at most 120 seconds                                                  |
| REST provider size | At most 100 MB                                                                              |
| EchoGuard size     | Stricter **10 MB** application limit for memory and hosting use                             |
| Provider formats   | WAV, MP3, M4A, FLAC, OGG, WebM; endpoint reference additionally lists AIFF                  |
| EchoGuard formats  | Verified subset: WAV, MP3, M4A                                                              |
| Response           | `object: deepfake.detection`, `request_id`, `operation_id`, `result`, model/credit metadata |
| Verdict            | `result.verdict`: `real`, `fake`, `not_sure`                                                |
| Audio details      | `result.duration_seconds`, `result.segments` with `start`, `end`, `score`                   |

EchoGuard uses the documented verdict, not its own threshold on the provider's
score. `not_sure` remains inconclusive. The UI shows segment time windows without
inventing flagged segments or scam probabilities. Segment scores describe synthetic
audio indications, not the chance that a caller is a scammer. The provider checks
audio validity/duration; EchoGuard checks size, extension, MIME and file signature,
not full decoding. English speech is the provider's focus; call-quality audio can
be less reliable.

The adapter is `services/detectifai.js`. It sends a server-owned Bearer key, fixed
allowlisted HTTPS endpoint, no redirects, a 90-second timeout and sanitized errors.
Keys, upstream error bodies and account details never go to the browser. The
request buffer is cleared in a `finally` block. No automatic transcription or
speaker verification is included.

### Configure and test your account

1. In the official DetectifAI dashboard create a key with `deepfake:detect` scope.
   Check account verification, credits and provider pricing before using it.
2. Put `DETECTIF_API_KEY` in your local ignored `.env` or hosting secret settings.
3. Set `DETECTIF_DEEPFAKE_URL=https://platform.detectif.ai/v1/deepfake/detect`
   (this is also the adapter default). Other URLs are rejected to prevent key leakage.
4. Restart the application. Upload a recording you have permission to process,
   longer than 4 seconds and up to 120 seconds, no larger than 10 MB.
5. Verify a real response and retain the request ID for provider support.

**A real account request was not tested in this environment: no key was present.**
Official docs verify the contract, not account-specific entitlement. Tests inject
responses and exercise real adapter construction/error handling without paid calls.
A key presence check is labeled configuration, never proof of successful access.

401/403 means check key, scope and account verification. 402 means insufficient
credits. 415/422 means unsupported, damaged, too-short/long or unusable audio.
429/503 means wait before retrying. Retry the same selection to preserve its
idempotency key (the provider caches these for 24 hours). After a page reload,
selection gets a new key, so a new request may incur a charge. The app makes no
automatic paid retries. Review the provider's privacy and retention terms before
sending personal recordings.

## PostgreSQL community storage

There was no existing database. The new persistence layer uses `pg`, parameterized
queries and `migrations/001-community.sql`. No production report uses in-memory
storage. PostgreSQL is a separate service: ordinary Render web filesystem writes
are not a database or durable report storage.

Use a local PostgreSQL instance for free development, or select a managed provider
and check its current pricing, quotas, expiry, backup and retention terms. Render
Postgres and other hosted plans may cost money; no paid resource is automatically
created by the included `render.yaml`.

Set securely:

- `DATABASE_URL`: the connection string supplied by your database host. Use its
  documented verified TLS settings and CA when connecting externally. Never set
  `rejectUnauthorized: false` or disable TLS verification as a workaround.
- `REPORT_ABUSE_SECRET`: at least 32 characters of private random data. Generate
  once, store securely and keep it stable across application restarts/instances.

Then run `npm run db:migrate` from the repository root using those settings. The
migration is transactional and safe to repeat. It creates tables/indexes without
deleting existing reports or seeding fake reports. Apply later schema changes with
new migrations rather than editing a deployed schema in place.

`reports` contains E.164 phone, category, private sanitized description (500 chars),
timestamp, visibility, daily connection hash and day. `abuse_windows` persists a
five-attempt-per-hour cap per action/connection across app restarts. Daily HMAC
hashes avoid storing raw IP addresses; duplicates for the same connection, number
and category on the same UTC day do not increase counts. Shared connections can
share these limits. The application additionally limits API requests in memory to
20/minute per connection. This secondary limit is per process, not distributed.
Hash retention is two days, pruned on successful writes; the operator must configure
backups and a suitable report retention/deletion policy before public use.

### Moderation

Search exposes only visible category aggregates, counts and the latest visible
report time. It does not return descriptions, reporter hashes or individual report
IDs. A number may be spoofed or reassigned. Counts are submissions, not people or
proof. Review requests are private rows in `review_requests`; there is no unattended
automated adjudication or public admin endpoint.

An authorized operator can inspect pending review requests using a secure database
console. Review the relevant reports privately, then hide incorrect reports with a
parameterized query such as `UPDATE reports SET visibility='hidden' WHERE id=$1`.
Mark the handled review request `reviewed`. Delete personal data when required by
your policy, and account for backups. Do not expose database consoles publicly.

## Application routes

| Route                                 | Behavior                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/health`                     | Process health, text availability and optional service configuration, not connectivity proof |
| `POST /api/transcript-analysis`       | JSON `{transcript}`; 1–12,000 characters, qualitative assessment with exact evidence         |
| `POST /api/voice-detection`           | One multipart `audio` upload to EchoGuard; adapter forwards it as provider field `file`      |
| `POST /api/audio/upload`              | Header/size validation only; no authenticity assessment                                      |
| `GET /api/community/categories`       | Allowed category IDs and labels                                                              |
| `GET /api/community/search?phone=...` | Encode the leading `+` as `%2B`; actual stored aggregates only                               |
| `POST /api/community/reports`         | JSON `{phone,category,description?,consent:true}`                                            |
| `POST /api/community/review`          | JSON `{phone,reason}`; reason `misleading`, `privacy` or `other`                             |

Missing database/abuse secret or failed database access returns 503, never a false
empty search. Invalid data returns 400; repeated reports return 200 with
`duplicate:true`; new submissions return 201; rate limits return 429. Analysis
failures return errors, never an automatic low-risk assessment.
