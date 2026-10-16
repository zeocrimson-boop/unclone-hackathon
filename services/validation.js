import path from "node:path";
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 12000;
const types = {
  ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
  ".mp3": ["audio/mpeg", "audio/mp3"],
  ".m4a": ["audio/mp4", "audio/x-m4a", "video/mp4"],
};
export function validateAudio(file) {
  if (!file?.buffer?.length) return "Choose a non-empty audio recording.";
  if (file.size > MAX_AUDIO_BYTES)
    return "The recording must be 10 MB or smaller.";
  const ext = path.extname(file.originalname).toLowerCase();
  if (
    !types[ext] ||
    ![...types[ext], "application/octet-stream"].includes(file.mimetype)
  )
    return "Use a WAV, MP3, or M4A audio file.";
  const b = file.buffer;
  const wave =
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WAVE";
  const mp3 =
    b.length >= 3 &&
    (b.toString("ascii", 0, 3) === "ID3" ||
      (b[0] === 255 && (b[1] & 224) === 224));
  const m4a =
    b.length >= 12 &&
    b.toString("ascii", 4, 8) === "ftyp" &&
    /^(M4A |M4B |isom|iso2|mp41|mp42|qt  )$/.test(b.toString("ascii", 8, 12));
  if (!(ext === ".wav" ? wave : ext === ".mp3" ? mp3 : m4a))
    return "The file contents do not match a supported audio format.";
  return null;
}
export function validateTranscript(text) {
  if (typeof text !== "string" || !text.trim())
    return "Paste text before analyzing.";
  if (text.length > MAX_TRANSCRIPT_CHARS)
    return "Keep the text under 12,000 characters.";
  return null;
}
