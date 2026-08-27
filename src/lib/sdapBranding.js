/**
 * sdapBranding.js — the SDAP "design matrix": a click-and-choose grid of design
 * parameters. The render terminal bakes the operator's picks into the exported
 * key-image; the dashboard injects them into generatePromptPayload() as a
 * <BRANDING_DIRECTIVE> block so any AI inherits the operator's house style.
 *
 * SDAP_BRANDING_FIELDS is a flat, ordered list of { type:'category' } headers and
 * parameter rows. Row types:
 *   chip   — pick one option (option = string, or { value, color?, tip? }; `color`
 *            draws a colour-coded underline on the chip)
 *   swatch — pick a colour from squares, or type a #hex
 *   slider — drag a 0..1 value
 * Adding a parameter is just adding a row here; the UI renders it automatically.
 *
 * Keep in sync with the dashboard's mirrored copy (DEFAULT_SDAP_BRANDING, the field
 * KEYS, renderBrandingDirective) so the sealed payload round-trips exactly.
 */

export const DEFAULT_SDAP_BRANDING = Object.freeze({
  v: 1,
  aesthetic: "Futuristic Terminal",
  palette: "Neon", accent: "#06b6d4", contrast: "High",
  fontStyle: "Mono", fontWeight: "Medium", fontPersona: "Futuristic", textCase: "UPPER",
  structure: "Grid", whitespace: "Moderate", density: "Comfortable",
  corners: "Chamfer", borderStyle: "Solid", borderWeight: "Thin",
  shadow: "Subtle", surface: "Flat", grain: "None",
  motion: "Subtle", speed: "Normal", hover: "Glow",
  vibe: "Futuristic", tone: "Professional",
  boldness: 0.6, focus: "Clear",
});

export const SDAP_BRANDING_FIELDS = [
  { type: "category", label: "AESTHETIC" },
  { key: "aesthetic", label: "Preset", type: "chip", tip: "Sets a starting point across the whole matrix",
    options: ["Futuristic Terminal", "Minimal Editorial", "Brutalist Mono", "Warm Analog", "Corporate Neutral", "Custom"] },

  { type: "category", label: "COLOUR" },
  { key: "palette", label: "Palette", type: "chip", tip: "Overall colour mood",
    options: [ { value: "Monochrome", color: "#8a8a8a" }, { value: "Neon", color: "#00e5ff" }, { value: "Earthy", color: "#8a6d3b" },
      { value: "Jewel", color: "#7b2d8e" }, { value: "Muted", color: "#9c8f9c" }, { value: "Vibrant", color: "#ff3b6b" },
      { value: "Grayscale", color: "#cccccc" }, { value: "Duotone", color: "#3b6bff" } ] },
  { key: "accent", label: "Accent", type: "swatch",
    options: [ { value: "#06b6d4", label: "Cyan" }, { value: "#3b82f6", label: "Blue" }, { value: "#8b5cf6", label: "Violet" },
      { value: "#ec4899", label: "Pink" }, { value: "#ef4444", label: "Red" }, { value: "#f59e0b", label: "Amber" },
      { value: "#22c55e", label: "Green" }, { value: "#14b8a6", label: "Teal" } ] },
  { key: "contrast", label: "Contrast", type: "chip", options: ["Low", "Medium", "High", "Max"] },

  { type: "category", label: "TYPE" },
  { key: "fontStyle", label: "Style", type: "chip", options: ["Serif", "Sans", "Display", "Mono", "Script"] },
  { key: "fontWeight", label: "Weight", type: "chip", options: ["Light", "Regular", "Medium", "Bold", "Heavy"] },
  { key: "fontPersona", label: "Feel", type: "chip", tip: "Type personality",
    options: ["Classic", "Modern", "Geometric", "Retro", "Futuristic", "Minimal"] },
  { key: "textCase", label: "Case", type: "chip", options: ["Normal", "UPPER", "lower", "Title"] },

  { type: "category", label: "LAYOUT" },
  { key: "structure", label: "Structure", type: "chip", options: ["Grid", "Asymmetric", "Freeform", "Diagonal"] },
  { key: "whitespace", label: "Space", type: "chip", tip: "Whitespace generosity",
    options: ["Minimal", "Moderate", "Generous", "Extreme"] },
  { key: "density", label: "Density", type: "chip", options: ["Compact", "Comfortable", "Loose"] },

  { type: "category", label: "SHAPE & BORDER" },
  { key: "corners", label: "Corners", type: "chip", options: ["Sharp", "Slight", "Rounded", "Pill", "Chamfer"] },
  { key: "borderStyle", label: "Border", type: "chip", options: ["None", "Solid", "Dashed", "Double", "Groove"] },
  { key: "borderWeight", label: "Weight", type: "chip", options: ["Hairline", "Thin", "Medium", "Thick"] },

  { type: "category", label: "DEPTH & TEXTURE" },
  { key: "shadow", label: "Shadow", type: "chip", options: ["None", "Subtle", "Moderate", "Strong"] },
  { key: "surface", label: "Surface", type: "chip", tip: "Material feel",
    options: ["Flat", "Matte", "Glossy", "Metallic", "Glass"] },
  { key: "grain", label: "Grain", type: "chip", tip: "Noise / texture",
    options: ["None", "Subtle", "Moderate", "Heavy"] },

  { type: "category", label: "MOTION" },
  { key: "motion", label: "Motion", type: "chip", options: ["None", "Subtle", "Moderate", "Exaggerated"] },
  { key: "speed", label: "Speed", type: "chip", options: ["Instant", "Fast", "Normal", "Slow"] },
  { key: "hover", label: "Hover", type: "chip", options: ["None", "Colour", "Scale", "Glow", "Underline"] },

  { type: "category", label: "MOOD" },
  { key: "vibe", label: "Vibe", type: "chip",
    options: ["Minimal", "Futuristic", "Retro", "Cyberpunk", "Brutalist", "Luxury", "Playful", "Dreamy"] },
  { key: "tone", label: "Tone", type: "chip",
    options: ["Professional", "Friendly", "Authoritative", "Warm", "Cold", "Neutral"] },

  { type: "category", label: "CLARITY" },
  { key: "boldness", label: "Latitude", type: "slider", min: 0, max: 1, step: 0.05 },
  { key: "focus", label: "Focus", type: "chip", tip: "Focus-state visibility",
    options: ["Subtle", "Clear", "Obvious"] },
];

// Picking an aesthetic prefills a spread of parameters; the operator can still change
// any cell afterward. "Custom" applies nothing.
export const AESTHETIC_PRESETS = Object.freeze({
  "Futuristic Terminal": { palette: "Neon", accent: "#06b6d4", contrast: "High", fontStyle: "Mono", fontPersona: "Futuristic",
    textCase: "UPPER", corners: "Chamfer", borderStyle: "Solid", surface: "Flat", shadow: "Subtle", motion: "Subtle",
    hover: "Glow", vibe: "Futuristic", tone: "Professional" },
  "Minimal Editorial": { palette: "Grayscale", accent: "#111111", contrast: "High", fontStyle: "Serif", fontWeight: "Regular",
    fontPersona: "Classic", textCase: "Title", structure: "Grid", whitespace: "Generous", density: "Loose", corners: "Slight",
    borderStyle: "None", shadow: "None", surface: "Matte", motion: "Subtle", hover: "Underline", vibe: "Minimal", tone: "Professional" },
  "Brutalist Mono": { palette: "Grayscale", accent: "#000000", contrast: "Max", fontStyle: "Mono", fontWeight: "Heavy",
    fontPersona: "Geometric", textCase: "UPPER", structure: "Grid", whitespace: "Minimal", density: "Compact", corners: "Sharp",
    borderStyle: "Solid", borderWeight: "Thick", shadow: "None", surface: "Flat", grain: "None", motion: "None", hover: "Colour",
    vibe: "Brutalist", tone: "Cold", focus: "Obvious" },
  "Warm Analog": { palette: "Earthy", accent: "#c2703d", contrast: "Medium", fontStyle: "Sans", fontWeight: "Regular",
    fontPersona: "Modern", textCase: "Normal", corners: "Rounded", borderStyle: "Solid", surface: "Matte", grain: "Subtle",
    motion: "Subtle", hover: "Colour", vibe: "Retro", tone: "Warm" },
  "Corporate Neutral": { palette: "Muted", accent: "#3b82f6", contrast: "Medium", fontStyle: "Sans", fontWeight: "Medium",
    fontPersona: "Modern", textCase: "Title", structure: "Grid", whitespace: "Moderate", corners: "Rounded", borderStyle: "Solid",
    borderWeight: "Hairline", shadow: "Subtle", surface: "Flat", motion: "Subtle", hover: "Scale", vibe: "Minimal", tone: "Professional" },
  "Custom": {},
});

export function applyAestheticPreset(current, aesthetic) {
  const preset = AESTHETIC_PRESETS[aesthetic];
  const next = { ...current, aesthetic };
  if (preset) for (const k of Object.keys(preset)) next[k] = preset[k];
  return next;
}

export function resolveSdapBranding(overrides) {
  const out = { ...DEFAULT_SDAP_BRANDING };
  if (overrides && typeof overrides === "object") {
    for (const f of SDAP_BRANDING_FIELDS) {
      if (!f.key) continue;
      const v = overrides[f.key];
      if (v !== undefined && v !== null && v !== "") out[f.key] = v;
    }
  }
  return out;
}

export function renderBrandingDirective(b) {
  const latitude = b.boldness >= 0.75 ? "HIGH — take real, defensible aesthetic risks"
    : b.boldness <= 0.3 ? "LOW — conservative, safe, production-obvious"
    : "MODERATE — distinctive but restrained";
  return [
    "<BRANDING_DIRECTIVE>",
    `AESTHETIC: ${b.aesthetic}`,
    `COLOUR: ${b.palette} palette, accent ${b.accent}, ${b.contrast} contrast`,
    `TYPE: ${b.fontStyle} ${b.fontWeight}, ${b.fontPersona} feel, ${b.textCase} case`,
    `LAYOUT: ${b.structure}, ${b.whitespace} whitespace, ${b.density} density`,
    `SHAPE: ${b.corners} corners, ${b.borderStyle} border (${b.borderWeight})`,
    `DEPTH: ${b.shadow} shadow, ${b.surface} surface, ${b.grain} grain`,
    `MOTION: ${b.motion} motion, ${b.speed} speed, ${b.hover} hover`,
    `MOOD: ${b.vibe} vibe, ${b.tone} tone`,
    `CREATIVE_LATITUDE: ${latitude}`,
    `FOCUS_STATES: ${b.focus}`,
    "</BRANDING_DIRECTIVE>",
  ].join("\n");
}
