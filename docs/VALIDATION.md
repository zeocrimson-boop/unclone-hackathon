# EchoGuard validation record

Validation during the 2026-10-16 upgrade. Source commit:
`deef8f325cc5d20eec04f36585eab7f2892d0995`. Node 24.19.0; Linux Chromium;
PostgreSQL 17.11 in an isolated local test instance. No hosted database or Render
application was deployed.

| Check actually executed | Outcome |
| --- | --- |
| Source inspection and destination copy | Existing Express application copied; source untouched; destination origin retained |
| Original `npm test` before changes | 23 passed |
| Original false-safe reproduction | Guaranteed huge investment profits returned Low with no findings |
| Frozen install `npm ci` | Passed |
| Updated `npm test` | 76 passed, zero failed/skipped |
| `npm run check` | Passed |
| `npm audit --omit=dev` | Zero reported vulnerabilities at time of check; not a security guarantee |
| Chromium `npm run test:browser` | Passed all qualitative text labels, exact evidence, XSS-safe text rendering, stale-result clearing on failure, audio validation, unavailable services, independent results, fixture voice verdict mapping, reset |
| Responsive browser check | No horizontal overflow at 320, 375, 768 and 1440 px |
| Automated accessibility | Two axe scans with WCAG 2 A/AA and 2.1 AA tags passed; not a complete manual accessibility review |
| `npm run test:db` | Passed against real PostgreSQL, including migrations twice, reports/search, duplicates, aggregates, private descriptions, application/pool restart persistence, moderation visibility, persistent rate cap and real browser search/report/review forms |
| Official DetectifAI documentation and OpenAPI | Retrieved and inspected; endpoint, method, Bearer auth, scope, multipart `file`, formats/limits and result fields verified |
| HTTPS proxy transport to official provider | `GET /v1/health` returned HTTP 200 |
| Actual multipart HTTP transport | Local HTTP test verifies audio is sent as multipart `file`, not stringified FormData |
| Real paid/authenticated voice detection | **Not run: no DETECTIF_API_KEY present** |
| Account-specific scope, credits and entitlement | **Not verified without an account key** |
| Hosted database persistence | **Not tested: no hosted DATABASE_URL configured** |
| Live Render deployment | **Not performed** |

Provider fixtures are isolated test data, not real voice results. Integration
phone reports exist only in a unique temporary test schema that is removed by the
check. No fake reports, recordings, model weights or keys are shipped.

The source application's inactive transcription module was removed. The upgraded
text engine works without external credentials. Voice and community features
show honest unavailable/error states until their services are configured.

Required service settings: optional `DETECTIF_API_KEY` (deepfake:detect), verified
`DETECTIF_DEEPFAKE_URL`, and for community reporting `DATABASE_URL` plus private
`REPORT_ABUSE_SECRET` of at least 32 characters. Set values securely, run the
migration and verify each configured service before public launch. PostgreSQL
itself, moderation, privacy/retention policies and provider access remain operator
responsibilities. The text workflow is deployable; this record is not a claim
that every external integration is live or the application is production-ready.
