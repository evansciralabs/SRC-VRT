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

/**
 * Per-aesthetic starting points. Selecting an aesthetic in the operator
 * console prefills these into the editable fields (the user can overwrite
 * any of them). "Custom" intentionally clears to blank prompts so the user
 * writes their own from scratch.
 */
export const AESTHETIC_PRESETS = Object.freeze({
  "Futuristic Terminal": {
    colorDirection: "Near-black ground, one electric accent (cyan or signal-orange), high contrast, scanline/glow restraint. No default purple gradients.",
    typeDirection: "Mono display face for headers, plain mono/sans for body. Wide tracking on labels.",
    signatureElement: "A single glowing terminal glyph or status readout as the one memorable flourish.",
  },
  "Minimal Editorial": {
    colorDirection: "Paper-white or warm-off-white ground, near-black ink, one restrained accent used sparingly.",
    typeDirection: "A characterful serif display face paired with a quiet sans body. Generous line-height.",
    signatureElement: "One oversized editorial headline or rule line; everything else calm and spacious.",
  },
  "Brutalist Mono": {
    colorDirection: "Raw ink-black on bone, or inverted. No gradients, hard edges, visible structure.",
    typeDirection: "One mono family at multiple weights. Exposed grid, unapologetic blocks.",
    signatureElement: "A heavy exposed border or oversized index number as the anchor.",
  },
  "Warm Analog": {
    colorDirection: "Charcoal or deep brown ground, amber/rust accents, subtle grain. Avoid clinical blue-white.",
    typeDirection: "A warm humanist sans or slab, soft but confident. Comfortable body size.",
    signatureElement: "A tactile grain or worn-edge treatment on one focal element.",
  },
  "Corporate Neutral": {
    colorDirection: "Cool neutral greys, one brand accent, ample whitespace, conservative contrast.",
    typeDirection: "A clean neutral sans (single family, two weights). Predictable hierarchy.",
    signatureElement: "One confident accent-colored CTA; restraint everywhere else.",
  },
  "Custom": {
    colorDirection: "",
    typeDirection: "",
    signatureElement: "",
  },
});

/**
 * Returns a new branding object with the preset for `aesthetic` applied over
 * the CURRENT branding. Only the preset-defined fields (color/type/signature)
 * are replaced; boldness/technicalConstraints and the aesthetic itself are
 * preserved from `current`. Callers use this on aesthetic-dropdown change.
 */
export function applyAestheticPreset(current, aesthetic) {
  const preset = AESTHETIC_PRESETS[aesthetic];
  const next = { ...current, aesthetic };
  if (preset) {
    for (const k of Object.keys(preset)) next[k] = preset[k];
  }
  return next;
}

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
