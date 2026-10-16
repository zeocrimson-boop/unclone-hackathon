// Upload selection/drag-drop/request lifecycle adapted from Sanchi Joshi's
// ai-voice-detector (MIT). See THIRD_PARTY_NOTICES.md and licenses/.
const $ = (id) => document.getElementById(id);
let selectedFile = null;
let uploadKey = null;
let previewUrl = null;
let scamResult = null;
let voiceResult = null;
let audioBusy = false;
let transcriptBusy = false;
const unavailable =
  "Voice detection is not configured yet. Configure the official DetectifAI API credentials and endpoint to enable this feature.";
const initialHeading = $("report-heading").textContent;

function selectFile(file) {
  if (audioBusy || !file) return;
  $("audio-error").textContent = "";
  if (!/\.(wav|mp3|m4a)$/i.test(file.name)) {
    $("audio-error").textContent = "Use a WAV, MP3, or M4A audio file.";
    return;
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    $("audio-error").textContent =
      "Choose a non-empty recording of 10 MB or less.";
    return;
  }
  releasePreview();
  selectedFile = file;
  uploadKey = crypto.randomUUID();
  previewUrl = URL.createObjectURL(file);
  $("audio-preview").src = previewUrl;
  $("file-name").textContent = file.name;
  $("file-size").textContent =
    `${(file.size / (1024 * 1024)).toFixed(2)} MB · Selected for analysis`;
  $("file-card").hidden = false;
  $("file-drop").hidden = true;
  voiceResult = null;
  $("voice-feedback").hidden = true;
  renderReport();
}
function releasePreview() {
  $("audio-preview").pause();
  $("audio-preview").removeAttribute("src");
  $("audio-preview").load();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}
function removeFile() {
  if (audioBusy) return;
  releasePreview();
  selectedFile = null;
  voiceResult = null;
  $("audio-file").value = "";
  $("file-card").hidden = true;
  $("file-drop").hidden = false;
  $("voice-feedback").hidden = true;
  $("audio-error").textContent = "";
  renderReport();
}
function busy(button, on, originalText) {
  button.disabled = on;
  button.classList.toggle("busy", on);
  button.textContent = on ? "Processing…" : originalText;
}
async function request(url, options) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(115000),
  });
  const data = await response.json();
  if (!response.ok && !data.voice)
    throw new Error(data.message || "The request could not be completed.");
  return data;
}
function message(error) {
  return ["TimeoutError", "AbortError"].includes(error.name)
    ? "The request timed out. Please try again."
    : error instanceof TypeError
      ? "Cannot reach the server. Check your connection and try again."
      : error.message;
}
$("choose-file").addEventListener("click", () => $("audio-file").click());
$("audio-file").addEventListener("change", () =>
  selectFile($("audio-file").files[0]),
);
$("remove-file").addEventListener("click", removeFile);
$("file-drop").addEventListener("dragover", (e) => {
  e.preventDefault();
  $("file-drop").classList.add("drag-over");
});
$("file-drop").addEventListener("dragleave", () =>
  $("file-drop").classList.remove("drag-over"),
);
$("file-drop").addEventListener("drop", (e) => {
  e.preventDefault();
  $("file-drop").classList.remove("drag-over");
  if (e.dataTransfer.files.length !== 1) {
    $("audio-error").textContent = "Choose one recording at a time.";
    return;
  }
  selectFile(e.dataTransfer.files[0]);
});
$("audio-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (audioBusy) return;
  $("audio-error").textContent = "";
  if (!selectedFile) {
    $("audio-error").textContent = "Choose an audio recording first.";
    return;
  }
  audioBusy = true;
  busy($("analyze-audio"), true);
  $("remove-file").disabled = true;
  const fileName = selectedFile.name;
  try {
    const body = new FormData();
    body.append("audio", selectedFile);
    const data = await request("/api/voice-detection", {
      method: "POST",
      body,
      headers: { "Idempotency-Key": uploadKey },
    });
    voiceResult = { ...data.voice, fileName };
    $("voice-feedback").textContent = data.voice.message;
    if (data.voice.segments?.length) {
      const segments = element(
        "p",
        "Provider segment windows (seconds): " +
          data.voice.segments.map((s) => `${s.start}–${s.end}`).join(", "),
      );
      $("voice-feedback").append(segments);
    }
    $("voice-feedback").hidden = false;
    renderReport();
  } catch (error) {
    voiceResult = { status: "error", message: message(error), fileName };
    $("audio-error").textContent = message(error);
    renderReport();
  } finally {
    audioBusy = false;
    busy($("analyze-audio"), false, "Analyze recording");
    $("remove-file").disabled = false;
    renderReport();
  }
});
function count() {
  $("char-count").textContent =
    `${$("transcript").value.length.toLocaleString()} / 12,000`;
}
$("transcript").addEventListener("input", count);
$("clear-transcript").addEventListener("click", () => {
  $("transcript").value = "";
  scamResult = null;
  renderReport();
  count();
  $("transcript-error").textContent = "";
  $("transcript").focus();
});
$("transcript-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (transcriptBusy) return;
  $("transcript-error").textContent = "";
  const transcript = $("transcript").value.trim();
  if (!transcript) {
    $("transcript-error").textContent = "Paste text before analyzing.";
    $("transcript").focus();
    return;
  }
  scamResult = null;
  renderReport();
  transcriptBusy = true;
  busy($("analyze-transcript"), true);
  $("clear-transcript").disabled = true;
  try {
    const data = await request("/api/transcript-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    if (
      data.status !== "success" ||
      !data.scam?.classification ||
      !Array.isArray(data.scam.findings)
    )
      throw new Error(
        "Analysis returned an invalid response. No text assessment is available.",
      );
    scamResult = data.scam;
    renderReport();
    $("report").focus({ preventScroll: true });
    $("report").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("transcript-error").textContent = message(error);
  } finally {
    transcriptBusy = false;
    busy($("analyze-transcript"), false, "Analyze Text");
    $("clear-transcript").disabled = false;
    renderReport();
  }
});
function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function renderReport() {
  const hasResult = !!(scamResult || voiceResult);
  $("empty-report").hidden = hasResult;
  $("report-content").hidden = !hasResult;
  $("report-heading").textContent = hasResult
    ? "Your independent assessments"
    : initialHeading;
  $("report-badge").textContent = scamResult
    ? "Text assessed"
    : voiceResult
      ? "Voice check received"
      : "Awaiting input";
  $("report").dataset.risk = scamResult?.risk || "";
  $("risk-value").textContent = scamResult
    ? scamResult.classification
    : "Not assessed";
  $("risk-summary").textContent =
    scamResult?.summary ||
    "Paste a transcript to assess conversation risk. Audio alone is not a scam assessment.";
  $("voice-value").textContent =
    voiceResult?.status === "error"
      ? "Service error"
      : voiceResult?.status === "inconclusive"
        ? "Inconclusive"
        : voiceResult?.status === "success"
          ? {
              real: "No strong synthetic indication",
              fake: "Synthetic indications found",
            }[voiceResult.verdict] || "Needs review"
          : voiceResult
            ? "Unavailable"
            : "Not assessed";
  $("voice-summary").textContent = voiceResult
    ? `${voiceResult.fileName}: ${voiceResult.message}`
    : "Transcript analysis cannot determine whether a voice is synthetic. Voice detection awaits official integration.";
  $("findings").replaceChildren();
  $("finding-count").textContent = scamResult?.findings.length ?? "—";
  if (scamResult?.findings.length)
    for (const finding of scamResult.findings) {
      const card = element("article", "", "finding");
      card.append(
        element("h5", finding.title),
        element("blockquote", `“${finding.evidence}”`),
        element("p", finding.explanation),
      );
      $("findings").append(card);
    }
  else
    $("findings").append(
      element(
        "p",
        scamResult
          ? "No configured warning patterns matched. Independently verify the opportunity anyway."
          : "No transcript has been analyzed.",
        "no-findings",
      ),
    );
  if (scamResult?.excerpts?.length)
    for (const excerpt of scamResult.excerpts)
      $("findings").append(
        element("blockquote", excerpt, "submitted-transcript"),
      );
  $("next-steps").replaceChildren();
  for (const step of scamResult?.nextSteps || [
    "Paste a transcript for a separate conversation-risk assessment.",
    "Verify the caller independently using the employer’s official website.",
  ])
    $("next-steps").append(element("li", step));
  $("submitted-transcript").textContent =
    scamResult?.transcript || "No transcript supplied.";
  $("limitations").textContent =
    scamResult?.limitations ||
    `${unavailable} No recording has been transcribed. Audio and transcript are independently supplied; their correspondence is not verified.`;
  if (scamResult)
    $("limitations").textContent +=
      " Audio and transcript are independently supplied; their correspondence is not verified.";
  $("start-over").disabled = audioBusy || transcriptBusy;
}
$("start-over").addEventListener("click", () => {
  if (audioBusy || transcriptBusy) return;
  scamResult = null;
  removeFile();
  $("transcript").value = "";
  count();
  $("transcript-error").textContent = "";
  renderReport();
  $("transcript").focus();
});
window.addEventListener("pagehide", releasePreview);
