import { randomUUID } from "node:crypto";
import { EnvHttpProxyAgent, FormData, fetch as providerFetch } from "undici";
// Honor the cloud's supported HTTPS egress route, including injected auth.
// EnvHttpProxyAgent respects NO_PROXY and preserves TLS verification.
const dispatcher =
  process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    ? new EnvHttpProxyAgent()
    : undefined;
export const OFFICIAL_ENDPOINT =
  "https://platform.detectif.ai/v1/deepfake/detect";
export const UNCONFIGURED_MESSAGE =
  "Voice detection is not configured yet. Configure the official DetectifAI API credentials and endpoint to enable this feature.";
export function voiceConfigured() {
  return (
    Boolean(process.env.DETECTIF_API_KEY) &&
    (!process.env.DETECTIF_DEEPFAKE_URL ||
      process.env.DETECTIF_DEEPFAKE_URL === OFFICIAL_ENDPOINT)
  );
}
// Verified against https://platform.detectif.ai/docs/api/detect-deepfake.md
// on 2026-10-16. Never infer voice verdicts from absent fields or raw scores.
export async function analyzeVoice(
  audioFile,
  {
    apiKey = process.env.DETECTIF_API_KEY,
    url = process.env.DETECTIF_DEEPFAKE_URL || OFFICIAL_ENDPOINT,
    fetchImpl = providerFetch,
    idempotencyKey = randomUUID(),
  } = {},
) {
  if (!apiKey || url !== OFFICIAL_ENDPOINT)
    return {
      status: "unavailable",
      code: "PROVIDER_NOT_CONFIGURED",
      message: UNCONFIGURED_MESSAGE,
    };
  const body = new FormData();
  body.append(
    "file",
    new Blob([audioFile.buffer], { type: audioFile.mimetype }),
    "recording" +
      /\.(wav|mp3|m4a)$/i.exec(audioFile.originalname)[0].toLowerCase(),
  );
  const response = await fetchImpl(url, {
    dispatcher,
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    // Never expose provider error bodies or credentials to the browser/logs.
    if ([400, 413, 415, 422].includes(response.status))
      return {
        status: "error",
        code: "AUDIO_REJECTED",
        message:
          "The provider could not use this recording. Use clear speech longer than 4 seconds and no longer than 120 seconds in a supported format.",
      };
    if (response.status === 402)
      return {
        status: "error",
        code: "PROVIDER_CREDITS",
        message:
          "Voice service has insufficient credits. Contact the operator.",
      };
    if ([429, 503].includes(response.status))
      return {
        status: "error",
        code: "PROVIDER_BUSY",
        message: "Voice service is busy. Wait before retrying this recording.",
      };
    throw Object.assign(new Error("Voice provider request failed"), {
      status: response.status,
    });
  }
  const data = await response.json();
  const result = data?.result;
  if (
    data?.object !== "deepfake.detection" ||
    typeof data.request_id !== "string" ||
    !["real", "fake", "not_sure"].includes(result?.verdict) ||
    !Number.isFinite(result.duration_seconds) ||
    result.duration_seconds <= 4 ||
    result.duration_seconds > 120 ||
    !Array.isArray(result.segments) ||
    result.segments.some(
      (segment) =>
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.start < 0 ||
        segment.end <= segment.start ||
        segment.end > result.duration_seconds ||
        !Number.isFinite(segment.score) ||
        segment.score < 0 ||
        segment.score > 1,
    )
  ) {
    return {
      status: "error",
      code: "PROVIDER_RESPONSE",
      message:
        "Voice service returned an unrecognized response. No assessment is available.",
    };
  }
  const messages = {
    real: "The provider found no strong indication of synthetic speech. This does not establish that the caller is trustworthy.",
    fake: "The provider found indications of synthetic speech. This is a signal, not proof of fraud or speaker identity.",
    not_sure:
      "The provider could not judge this recording reliably. Try longer or clearer speech. No authenticity conclusion is available.",
  };
  return {
    status: result.verdict === "not_sure" ? "inconclusive" : "success",
    verdict: result.verdict,
    message: messages[result.verdict],
    requestId: data.request_id,
    durationSeconds: result.duration_seconds,
    // Provider segment scores describe audio, never scam probability. The UI
    // shows time ranges only; these fields are never combined with text risk.
    segments: result.segments.map(({ start, end, score }) => ({
      start,
      end,
      score,
    })),
  };
}
export function voiceFailure(error) {
  const timeout = ["TimeoutError", "AbortError"].includes(error?.name);
  const authentication = [401, 403].includes(error?.status);
  return {
    status: "error",
    code: timeout
      ? "PROVIDER_TIMEOUT"
      : authentication
        ? "PROVIDER_AUTHENTICATION"
        : "PROVIDER_UNAVAILABLE",
    message: timeout
      ? "Voice service timed out. Retry this recording later."
      : authentication
        ? "Voice service authentication or scope check failed. Ask the operator to check provider settings."
        : "Voice service could not be reached. Text analysis is still available.",
  };
}
