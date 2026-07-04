# OTR ↔ SRC-D2 integration bundle

Render terminal (SRC-VRT) bakes callsign + glyph + SDAP branding into an
exported PNG as plaintext LSB stego. Dashboard (SRC-D2) reads it on import,
auto-fills both operator fields, and fires its EXISTING _confirmOperatorId()
for hands-free login. No new crypto — the dashboard's own callsign+glyph
key derivation does all encryption on the recovered values.

## Design decision (locked)
- Glyph rides in the image as plaintext so both operator fields visibly
  auto-fill and cross-device cold login works.
- Consequence: the exported PNG IS a credential. Handle like a key file,
  never a public avatar. Both UIs state this to the user.
- Foreign/wrong image → dashboard's existing silent-fail path drops to guest.
  Nothing new to build for that; it falls out of reusing _confirmOperatorId.

## Files
- imagePayloadCodec.js .......... SHARED. Plaintext LSB seal/reveal. No crypto.
                                   Copy into BOTH apps (VRT: src/lib/ import;
                                   dashboard: extractor already inlined in
                                   dashboard-operator-import.js).
- sdapBranding.js ............... SHARED. SDAP default params + merge + directive
                                   render. Copy into both (dashboard: inline it).
- dashboard-operator-import.js .. DASHBOARD. Drop-in <script> block: image →
                                   extract → auto-fill → auto-login → persist
                                   branding. Includes an inlined codec extractor
                                   so the single-file app needs no import.
- generatePromptPayload-patch.md  DASHBOARD. The ~2-line injection that makes
                                   imported branding overwrite SDAP defaults.
- vrt-operator-console-patch.md . RENDER TERMINAL. Operator fields in the
                                   Export Modal + seal-on-export in
                                   executeRenderPipeline.
- veilpointSanitizer.js ......... RENDER TERMINAL, independent security fix.
                                   Replaces the bypassable regex sanitizer in
                                   extractVeilpointPayload (DOMPurify + CSS
                                   scoping). Verified against 5 bypasses in a
                                   real browser. Needs `npm i dompurify`.

## Verified headlessly (real Chromium)
- Full seal → PNG encode → decode → reveal round-trip (payload survives PNG).
- Unicode glyph + SDAP branding recover exactly.
- Non-payload / corrupted images return null (silent-fail), never throw.
- Pixel damage ≤ 1/255 per channel (invisible).
- Branding merges into the PHANTOM_CREW prompt directive.
- Sanitizer neutralizes unquoted/single-quoted onload, nested <script>,
  javascript: URIs, foreignObject; CSS scoping blocks UI-redress.

## Apply order
1. Dashboard: inline sdapBranding.js + apply generatePromptPayload-patch.md,
   add dashboard-operator-import.js block + the two DOM elements it wires
   (#operator-image-drop, #operator-image-input) into the operator modal.
2. Render terminal: copy imagePayloadCodec.js + sdapBranding.js to src/lib/,
   apply vrt-operator-console-patch.md, apply veilpointSanitizer.js fix,
   `npm i dompurify`.
3. Both live on GitHub Pages under the same origin — the sanitizer fix
   matters because a malicious .srcd in VRT shares localStorage with SRC-D2.
