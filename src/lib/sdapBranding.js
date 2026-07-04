/**
 * sdapBranding.js — the SDAP "default parameters" object the render terminal
 * customizes and the dashboard injects into generatePromptPayload().
 *
 * SHARED by both apps: the render terminal's operator console edits these
 * fields and bakes them into the exported image; the dashboard reads them
 * back on import and merges them over its own copy of DEFAULT_SDAP_BRANDING
 * before assembling the prompt. Keep this file byte-identical in both repos
 * (or publish it once and import it in both).
 *
 * Field semantics: these describe HOW generated code should look/feel, not
 * WHAT it does. They translate into a <BRANDING_DIRECTIVE> block appended to
 * the PHANTOM_CREW handshake, so any AI given the prompt inherits the
 * operator's house style instead of defaulting to generic AI-coder output.
 */

export const DEFAULT_SDAP_BRANDING = Object.freeze({
  v: 1,
  aesthetic: "Futuristic Terminal",
  colorDirection:
    "Dark ground, one saturated accent, high contrast. Avoid default purple gradients and cream/terracotta AI-default palettes.",
  typeDirection:
    "A distinctive display face paired with a plain legible mono/body face. No bare system-UI stack.",
  boldness: 0.6, // 0 = conservative/safe, 1 = take real aesthetic risks
  technicalConstraints:
    "Accessible contrast and visible keyboard focus states. Prefer no new dependencies unless clearly justified. Mobile-first.",
  signatureElement:
    "One deliberate, on-brief signature element; keep everything else disciplined and quiet.",
});

export const SDAP_BRANDING_FIELDS = [
  { key: "aesthetic", label: "AESTHETIC", type: "select",
    options: ["Futuristic Terminal","Minimal Editorial","Brutalist Mono","Warm Analog","Corporate Neutral","Custom"] },
  { key: "colorDirection", label: "COLOR DIRECTION", type: "text" },
  { key: "typeDirection", label: "TYPE DIRECTION", type: "text" },
  { key: "boldness", label: "CREATIVE LATITUDE", type: "slider", min: 0, max: 1, step: 0.05 },
  { key: "technicalConstraints", label: "TECHNICAL CONSTRAINTS", type: "text" },
  { key: "signatureElement", label: "SIGNATURE ELEMENT", type: "text" },
];

/** Merge image-provided overrides on top of the hardcoded defaults. */
export function resolveSdapBranding(overrides) {
  if (!overrides || typeof overrides !== "object") return { ...DEFAULT_SDAP_BRANDING };
  const out = { ...DEFAULT_SDAP_BRANDING };
  for (const f of SDAP_BRANDING_FIELDS) {
    if (overrides[f.key] !== undefined && overrides[f.key] !== null && overrides[f.key] !== "") {
      out[f.key] = overrides[f.key];
    }
  }
  return out;
}

/**
 * Renders a branding object into the text block that gets appended to the
 * PHANTOM_CREW prompt. Pure string builder — no DOM, testable in isolation.
 */
export function renderBrandingDirective(b) {
  const boldnessWord =
    b.boldness >= 0.75 ? "HIGH — take real, defensible aesthetic risks"
    : b.boldness <= 0.3 ? "LOW — conservative, safe, production-obvious"
    : "MODERATE — distinctive but restrained";
  return [
    `<BRANDING_DIRECTIVE>`,
    `AESTHETIC: ${b.aesthetic}`,
    `COLOR: ${b.colorDirection}`,
    `TYPE: ${b.typeDirection}`,
    `CREATIVE_LATITUDE: ${boldnessWord}`,
    `CONSTRAINTS: ${b.technicalConstraints}`,
    `SIGNATURE: ${b.signatureElement}`,
    `</BRANDING_DIRECTIVE>`,
  ].join("\n");
}
