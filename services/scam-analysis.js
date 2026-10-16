// Transparent English-language heuristics. One score contribution per rule.
// Thresholds are editorial triage weights, NOT probabilities or learned scores.
export const rules = [
  {
    id: "fees",
    title: "Upfront fee request",
    weight: 3,
    pattern:
      /\b(pay|send|transfer|deposit|charged?|payment|required|need|must)\b.{0,65}\b(registration|internship|training|application|processing|security|joining)\s*(?:fees?|deposit|payment)\b|\b(registration|internship|training|application|processing|security|joining)\s*(?:fees?|deposit)\b.{0,65}\b(pay|required|send|transfer|deposit|must)\b/i,
    explanation:
      "Paying to secure an internship or apply is a warning sign. Verify the opportunity independently before paying.",
  },
  {
    id: "credentials",
    title: "Sensitive information requested",
    weight: 5,
    pattern:
      /\b(share|send|tell|give|provide|confirm|enter|disclose|reveal|read|need|want)\b.{0,60}\b(otp|one[- ]time (?:password|code)|password|pin|bank(?:ing)? (?:credentials|details|login)|card (?:number|details)|cvv)\b/i,
    explanation:
      "Requests for OTPs, passwords, PINs, or banking credentials can enable account theft. Never disclose them to a caller.",
  },
  {
    id: "pressure",
    title: "Urgent payment pressure",
    weight: 3,
    pattern:
      /\b(pay|payment|send|transfer|deposit)\b.{0,65}\b(now|immediately|urgent(?:ly)?|today|within \d+ minutes?)\b|\b(urgent(?:ly)?|immediately|within \d+ minutes?)\b.{0,65}\b(pay|send|transfer|deposit|money)\b/i,
    explanation:
      "Time pressure around payments can prevent careful verification. Pause and contact the organization through its official website.",
  },
  {
    id: "expiry",
    title: "Offer-expiry pressure",
    weight: 2,
    pattern:
      /\b(offer|opportunity|position|selection)\b.{0,65}\b(expire|expires|withdrawn|cancelled|lose|last chance|immediately|minutes)\b/i,
    explanation:
      "A rapidly expiring offer can be used to pressure you into a decision. Ask for written terms and time to verify.",
  },
  {
    id: "payment",
    title: "Unusual payment instructions",
    weight: 3,
    pattern:
      /\b(pay|send|transfer|buy|deposit)\b.{0,65}\b(gift cards?|crypto(?:currency)?|bitcoin|personal (?:account|upi)|upi id|wallet)\b/i,
    explanation:
      "Personal accounts, gift cards, and cryptocurrency may be difficult to recover. Verify both the recipient and the reason for payment.",
  },
  {
    id: "software",
    title: "Software installation request",
    weight: 2,
    pattern:
      /\b(install|download|run)\b.{0,65}\b(anydesk|teamviewer|remote[- ](?:access|desktop)|apk|software|app|application|executable)\b/i,
    explanation:
      "Unverified software and remote-access tools can expose your device. Use only verified employer channels and do not grant remote access.",
  },
  {
    id: "links",
    title: "Unverified link shared",
    weight: 1,
    pattern: /https?:\/\/[^\s<>]+|\b(?:bit\.ly|tinyurl\.com|t\.me)\/[^\s<>]+/i,
    explanation:
      "This is an unverified link, not proof of a malicious website. Navigate independently to the official employer site before sharing information.",
  },
  {
    id: "guarantee",
    title: "Guaranteed-selection claim",
    weight: 1,
    pattern:
      /\b(guaranteed? (?:selection|internship|job)|selected without (?:an? )?interview|100% (?:selection|placement))\b/i,
    explanation:
      "Guaranteed selection deserves extra scrutiny when paired with payment or credential demands. Confirm the hiring process directly.",
  },
];

// Additional contextual patterns, grouped by the type of harm they describe.
const additionalRules = [
  [
    "no-interview",
    "Employment",
    "Guaranteed work without a credible hiring process",
    3,
    /\b(?:job|offer|salary|internship|selected)\b.{0,85}\b(?:no interview|without (?:an? )?interview|no experience needed)\b/i,
    "Unusually easy selection needs verification, especially with payment demands. Confirm the employer and written hiring process.",
  ],
  [
    "reward-fee",
    "Prizes and refunds",
    "Unexpected reward tied to a payment",
    5,
    /\b(?:won|winner|lottery|prize|reward|refund)\b.{0,110}\b(?:pay|transfer|fee|deposit)\b/i,
    "A payment demand to receive an unexpected prize or refund is a strong warning sign. Verify through the official organization.",
  ],
  [
    "job-payment",
    "Employment",
    "Payment to secure work",
    5,
    /\b(?:pay|send|deposit|transfer)\b.{0,100}\b(?:secure|confirm|reserve|unlock|join|selected?|selection)\b.{0,60}\b(?:job|internship|offer|placement|position)\b|\b(?:refundable deposit|interview fee|onboarding fee|equipment fee)\b/i,
    "Paying to secure employment is a strong warning sign. Contact the employer independently.",
  ],
  [
    "bank-threat",
    "Banking",
    "Account threat combined with a demand",
    5,
    /\b(?:account|sim|kyc)\b.{0,90}\b(?:block|suspend|frozen|freeze|deactivat)\w*.{0,100}\b(?:pay|transfer|send|link|click|verify)\b/i,
    "Suspension threats can pressure you into payments or account takeover. Use the official app or number.",
  ],
  [
    "qr-payment",
    "Banking",
    "Approval requested to receive money",
    5,
    /\b(?:scan|enter|approve)\b.{0,60}\b(?:qr|pin|payment|collect request)\b.{0,70}\b(?:receive|refund|cashback)\b/i,
    "A PIN or payment approval normally authorizes an outgoing payment; verify before approving.",
  ],
  [
    "identity",
    "Identity",
    "Pressured identity or recovery request",
    4,
    /\b(?:send|share|upload|provide|enter)\b.{0,60}\b(?:aadhaar|aadhar|pan card|recovery codes?|verification codes?|upi pin|debit.card pin)\b/i,
    "Identity documents and recovery codes can be misused. Verify the request through an independent official channel.",
  ],
  [
    "investment",
    "Investment",
    "Unrealistic financial promise",
    3,
    /\b(?:guarantee[ds]?|risk.free|double|huge|assured)\b.{0,55}\b(?:profits?|returns?|money|investment|income)\b|\b(?:profits?|returns?)\b.{0,40}\bguaranteed\b/i,
    "Guaranteed or unusually large returns deserve scrutiny. Check the provider with the relevant regulator.",
  ],
  [
    "advance-fee",
    "Investment",
    "Payment before funds are released",
    5,
    /\b(?:pay|deposit|send|fee|transfer)\b.{0,90}\b(?:withdraw|release|unlock|recover|claim|receive)\b.{0,60}\b(?:profits?|loan|scholarship|grant|subsidy|funds|money|prize|reward|refund|lottery)\b|\b(?:loan|scholarship|lottery|prize|refund|recovery)\b.{0,90}\b(?:upfront|processing fee|pay first|advance fee)\b/i,
    "An advance payment to receive or recover money is a common scam pattern. Verify before paying.",
  ],
  [
    "pyramid",
    "Investment",
    "Recruitment-linked returns",
    3,
    /\b(?:recruit|refer|bring|join)\b.{0,70}\b(?:members|friends|people)\b.{0,70}\b(?:earn|commission|returns|profit)\b/i,
    "Returns tied to recruiting others may indicate a pyramid scheme. Check how revenue is generated.",
  ],
  [
    "delivery",
    "Delivery",
    "Parcel release pressure",
    3,
    /\b(?:parcel|package|delivery|courier|customs)\b.{0,90}\b(?:held|blocked|failed|fee|pay|otp|link|click)\b/i,
    "Unexpected delivery fees or verification links can be fraudulent. Track the parcel on the courier’s official site.",
  ],
  [
    "remote-banking",
    "Technical support",
    "Remote access while banking",
    5,
    /\b(?:remote.access|anydesk|teamviewer|share your screen|screen sharing|remote control)\b.{0,110}\b(?:bank|banking|payment|account)\b/i,
    "Remote access or screen sharing during banking can expose credentials and authorize theft.",
  ],
  [
    "security-disable",
    "Technical support",
    "Security protections targeted",
    4,
    /\b(?:disable|turn off|uninstall)\b.{0,45}\b(?:antivirus|security|firewall|protections?)\b|\b(?:device|computer|phone)\b.{0,45}\binfected\b.{0,65}\b(?:call|install|pay|download)\b/i,
    "Unexpected instructions to disable security or install support software can compromise your device.",
  ],
  [
    "authority",
    "Impersonation",
    "Authority threat or secrecy",
    5,
    /\bdigital arrest\b|\b(?:police|government|court|tax|arrest|legal action|fine)\b.{0,100}\b(?:pay|transfer|immediately|money|secret)\b|\b(?:pay|transfer)\b.{0,75}\b(?:arrest|legal action)\b/i,
    "Threats of arrest or urgent official payments are strong coercion indicators. Verify using official contact details.",
  ],
  [
    "secrecy",
    "Social engineering",
    "Payment combined with secrecy",
    4,
    /\b(?:send|transfer|pay|money)\b.{0,95}\b(?:secret|do not tell|don't tell|dont tell|do not contact|don't contact)\b|\b(?:keep it secret|don't tell anyone)\b.{0,85}\b(?:money|pay|transfer)\b/i,
    "Secrecy prevents independent verification. Contact the person through a previously known channel.",
  ],
  [
    "emergency",
    "Social engineering",
    "Urgent personal money request",
    3,
    /\b(?:emergency|stranded|hospital|new number|lost my phone)\b.{0,100}\b(?:money|transfer|send|pay)\b/i,
    "Emergency impersonation can exploit concern for someone you know. Call their previously known number.",
  ],
  [
    "extortion",
    "Social engineering",
    "Threats involving private material",
    5,
    /\b(?:pay|send|transfer)\b.{0,100}\b(?:leak|publish|release|expose)\b.{0,65}\b(?:photos?|videos?|pictures?|private|personal)\b/i,
    "Threats involving personal material can indicate extortion. Preserve evidence and seek official help.",
  ],
  [
    "attachment",
    "Links and contact",
    "Unexpected attachment or platform move",
    2,
    /\b(?:open|download)\b.{0,55}\b(?:unexpected attachment|unknown apk|attached executable)\b|\b(?:move|switch|contact)\b.{0,55}\b(?:telegram|whatsapp)\b.{0,75}\b(?:pay|deposit|password|otp)\b/i,
    "Unexpected software or moving a payment request off an official channel deserves independent verification.",
  ],
];
for (const [
  id,
  category,
  title,
  weight,
  pattern,
  explanation,
] of additionalRules)
  rules.push({ id, category, title, weight, pattern, explanation });

const originalCategories = {
  fees: "Employment",
  credentials: "Banking",
  pressure: "Payment pressure",
  expiry: "Employment",
  payment: "Banking",
  software: "Technical support",
  links: "Links and contact",
  guarantee: "Employment",
};
for (const rule of rules)
  if (!rule.category) rule.category = originalCategories[rule.id] || "General";

export const LABELS = Object.freeze({
  High: "Likely a scam",
  Moderate: "Suspicious — verify first",
  Low: "Mostly not a scam based on the text provided",
  Insufficient: "Not enough information",
});
export const LIMITATIONS =
  "Automated rule-based assessment, not a trained AI model or proof of fraud. English and common Indian-English patterns only; unfamiliar wording, languages, sarcasm and quoted context may be missed. No warning signs does not prove safety. Voice and community reports are separate signals.";

function actionableClause(clause) {
  // Normalize for matching only; evidence always comes from the original text.
  let value = clause
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑–—]/g, "-")
    .toLowerCase();
  // Educational descriptions and protective advice are not demands. Only suppress
  // the relevant clause so a later suspicious instruction is still assessed.
  if (
    /\b(?:this article|safety (?:guide|tip)|educational|awareness)\b/.test(
      value,
    ) &&
    /\b(?:scam|phishing|fraud|never|why)\w*/.test(value)
  )
    return "";
  value = value.replace(
    /\b(?:do not|don't|dont|never|not to|avoid)\s+(?:(?:ever|need to|have to)\s+)?(?:share|send|tell|give|provide|enter|pay|transfer|install|download|scan|approve)\b[^,;]*(?:[,;]|$)/g,
    " ",
  );
  value = value.replace(
    /\b(?:never|do not|don't)\s+ask\b[^,;]*(?:[,;]|$)/g,
    " ",
  );
  value = value.replace(
    /\bno\s+(?:registration|internship|training|application|processing|joining)\s+fees?\s+(?:is\s+|are\s+)?(?:required|needed|charged)\b/g,
    " ",
  );
  return value;
}
export function analyzeTranscript(text) {
  if (typeof text !== "string") throw new TypeError("Text must be a string");
  const clauses = text.split(
    /(?:\r?\n|(?<=[.!?])\s+|\s+(?:but|however|instead)\s+)+/i,
  );
  const findings = [];
  for (const rule of rules) {
    const evidence = clauses.find((clause) =>
      rule.pattern.test(actionableClause(clause)),
    );
    if (evidence)
      findings.push({
        id: rule.id,
        category: rule.category || "General",
        title: rule.title,
        evidence: evidence.trim(),
        explanation: rule.explanation,
      });
  }
  // Internal editorial weights are not probabilities and are never returned.
  const weight = findings.reduce(
    (sum, finding) => sum + rules.find((rule) => rule.id === finding.id).weight,
    0,
  );
  const insufficient =
    text.trim().length < 25 || text.trim().split(/\s+/).length < 5;
  const risk =
    weight >= 5
      ? "High"
      : weight >= 2
        ? "Moderate"
        : insufficient
          ? "Insufficient"
          : "Low";
  const reportedContext =
    /\b(?:scammer said|report(?:ing|ed)?|quoted|caller said)\b/i.test(text);
  return {
    status: "success",
    method: "Transparent contextual rules · English",
    risk,
    classification: LABELS[risk],
    summary: findings.length
      ? `${findings.length} warning ${findings.length === 1 ? "sign" : "signs"} found in the supplied text.${reportedContext ? " This appears to describe or quote an incident; findings assess the quoted demand, not the person reporting it." : ""}`
      : insufficient
        ? "Add more context about what was requested and why. There is too little information for a useful assessment."
        : "No strong warning signs were found in this text. This does not establish safety; verify unfamiliar requests independently.",
    findings,
    transcript: text,
    excerpts: findings.length
      ? []
      : clauses
          .filter((c) => c.trim())
          .slice(0, 2)
          .map((c) => c.trim()),
    nextSteps: [
      "Verify the sender through independently obtained official contact details.",
      "Never share OTPs, passwords, PINs or recovery codes with a caller.",
      "Pause unexpected payments, links and remote-access requests until verified.",
      "If money or credentials were shared, contact your bank promptly and report through your official cybercrime channel.",
    ],
    limitations: LIMITATIONS,
  };
}
