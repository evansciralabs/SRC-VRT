# OTR ↔ SRC-D2 integration bundle

Render terminal (SRC-VRT) embeds callsign / glyph / SDAP branding into an
exported PNG (plaintext LSB stego). Dashboard (SRC-D2) reads it on import,
auto-fills the operator fields, and fires its EXISTING _confirmOperatorId()
for hands-free login. The dashboard's own callsign+glyph key derivation is
the only crypto — the terminal never encrypts and never binds glyphs.

## Three export modes (decided purely by which fields the user fills)

| Fields          | Mode                  | Import behavior                                    |
|-----------------|-----------------------|----------------------------------------------------|
| neither         | GUEST                 | no payload → dashboard no-op → normal guest        |
| callsign only   | DEVICE-LOCKED SESSION | origin device logs in via its cached glyph;        |
|                 |                       | any other device silently drops to guest           |
| callsign+glyph  | PORTABLE KEY          | works on any device — hands a collaborator the      |
|                 |                       | credential without pasting raw callsign/glyph text |

The device-lock is genuine but it is enforced ENTIRELY by the dashboard's
existing logic (srcd2_devcache_glyph_<callsign> + cfg.dataKeyGlyphHash in
_confirmOperatorId): a callsign-only image finds the cached glyph ONLY on the
device where the glyph was originally bound, and finds nothing (→ guest)
anywhere else. The render terminal contributes nothing to the lock; it only
embeds fields, so its UI describes intent honestly rather than promising a
hard lock it can't enforce.

Caveat worth keeping in mind: a callsign-only image is only device-locked if
that callsign was already glyph-bound in the dashboard. If it never was, the
dashboard derives a callsign-alone key that works on any device with just the
callsign. Glyph-binding stays a dashboard action (by design).

## Files
- imagePayloadCodec.js .......... SHARED. Plaintext LSB seal/reveal, no crypto.
                                   Handles empty / callsign-only / callsign+glyph.
- sdapBranding.js ............... SHARED. SDAP defaults + merge + directive render.
- dashboard-operator-import.js .. DASHBOARD. Image → extract → auto-fill → fire
                                   _confirmOperatorId → persist branding. Inlined
                                   extractor (single-file app, no imports).
- generatePromptPayload-patch.md  DASHBOARD. ~2-line injection: imported branding
                                   overrides SDAP defaults in the prompt.
- vrt-operator-console-patch.md . RENDER TERMINAL. Three-mode operator fields in
                                   the Export Modal + seal-on-export. Live mode
                                   readout; honest warning only on portable-key mode.
- veilpointSanitizer.js ......... RENDER TERMINAL, independent security fix.
                                   DOMPurify + CSS scoping for extractVeilpointPayload.
                                   `npm i dompurify`. Verified vs 5 bypasses.

## Verified headlessly (real Chromium)
- Seal → real PNG encode → decode → reveal round-trips (survives PNG).
- All three modes (empty / callsign-only / callsign+glyph) reveal correctly.
- Empty-callsign image collapses to the dashboard's guest path via !payload.callsign.
- Unicode glyph + SDAP branding recover exactly; branding merges into prompt.
- Non-payload / corrupted images → null, never throw.
- Pixel damage ≤ 1/255 (invisible).
- Sanitizer neutralizes unquoted/single-quoted onload, nested <script>,
  javascript: URIs, foreignObject; CSS scoping blocks UI-redress.

## Apply order
1. Dashboard: inline sdapBranding.js + generatePromptPayload-patch.md; add
   dashboard-operator-import.js block + its two DOM elements
   (#operator-image-drop, #operator-image-input) in the operator modal.
2. Render terminal: copy imagePayloadCodec.js + sdapBranding.js to src/lib/;
   apply vrt-operator-console-patch.md; apply veilpointSanitizer.js fix;
   `npm i dompurify`.
3. Both live under one GitHub Pages origin — the sanitizer fix matters because
   a malicious .srcd imported in VRT shares localStorage with SRC-D2.
