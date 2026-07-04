/**
 * imagePayloadCodec.js — SHARED plaintext LSB stego codec.
 *
 * Contract between the two apps (Option 1, no encryption):
 *   Render terminal:  sealImagePayload(imageData, { callsign, glyph, sdap }) -> ImageData
 *   Dashboard:        revealImagePayload(imageData) -> { callsign, glyph, sdap } | null
 *
 * The payload is PLAINTEXT in the pixel LSBs. This is deliberate per the
 * chosen design: the dashboard needs the real glyph string to derive its
 * AES key, and both operator fields must visibly auto-fill. The exported
 * PNG is therefore a private credential — handle it like a key file, never
 * a public avatar. (This module intentionally contains NO crypto; all
 * encryption on the dashboard side happens AFTER extraction, using the
 * dashboard's own _deriveKey pipeline on the recovered callsign+glyph.)
 *
 * Header (9 bytes) lets the dashboard reject non-payload images cleanly
 * (silent fail, not a crash):
 *   [0..3] magic "OTR1"   [4] version   [5..8] payload length uint32 BE
 *
 * Works on a Uint8ClampedArray shaped like ImageData.data (RGBA, 4B/px);
 * writes R,G,B LSBs, leaves alpha untouched. Framework-free, so it runs in
 * React (render terminal) and vanilla (dashboard) unchanged, and under Node
 * for tests.
 */

const MAGIC = [0x4f, 0x54, 0x52, 0x31]; // "OTR1"
const VERSION = 1;
const HEADER_BYTES = 9;

function u8(dataOrImageData) {
  // Accept either an ImageData-like {data} or a raw typed array.
  return dataOrImageData && dataOrImageData.data ? dataOrImageData.data : dataOrImageData;
}

function bytesToBits(bytes) {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++)
    for (let b = 0; b < 8; b++) bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
  return bits;
}
function bitsToBytes(bits) {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    bytes[i] = v;
  }
  return bytes;
}

export function capacityBytes(pixelLen) {
  const usableBits = Math.floor(pixelLen / 4) * 3;
  return Math.max(0, Math.floor(usableBits / 8) - HEADER_BYTES);
}

function embedBytes(pixels, payloadBytes) {
  const cap = capacityBytes(pixels.length);
  if (payloadBytes.length > cap)
    throw new Error(`Payload ${payloadBytes.length}B exceeds carrier capacity ${cap}B — use a larger layout.`);
  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  new DataView(header.buffer).setUint32(5, payloadBytes.length, false);
  const full = new Uint8Array(HEADER_BYTES + payloadBytes.length);
  full.set(header, 0);
  full.set(payloadBytes, HEADER_BYTES);
  const bits = bytesToBits(full);
  const out = new Uint8ClampedArray(pixels);
  let bi = 0;
  for (let p = 0; p < out.length && bi < bits.length; p += 4)
    for (let c = 0; c < 3 && bi < bits.length; c++, bi++)
      out[p + c] = (out[p + c] & 0xfe) | bits[bi];
  return out;
}

function extractBytes(pixels) {
  const hb = new Uint8Array(HEADER_BYTES * 8);
  let bi = 0;
  for (let p = 0; p < pixels.length && bi < hb.length; p += 4)
    for (let c = 0; c < 3 && bi < hb.length; c++, bi++) hb[bi] = pixels[p + c] & 1;
  const header = bitsToBytes(hb);
  for (let i = 0; i < MAGIC.length; i++) if (header[i] !== MAGIC[i]) return null;
  if (header[4] !== VERSION) return null;
  const len = new DataView(header.buffer).getUint32(5, false);
  if (len > capacityBytes(pixels.length)) return null;
  const total = (HEADER_BYTES + len) * 8;
  const bits = new Uint8Array(total);
  bi = 0;
  for (let p = 0; p < pixels.length && bi < total; p += 4)
    for (let c = 0; c < 3 && bi < total; c++, bi++) bits[bi] = pixels[p + c] & 1;
  return bitsToBytes(bits).slice(HEADER_BYTES);
}

/** Render terminal: bake {callsign, glyph, sdap} into a copy of the pixels. */
export function sealImagePayload(imageDataOrPixels, { callsign, glyph, sdap }) {
  const obj = { v: 1, callsign: (callsign || "").trim(), glyph: (glyph || "").trim(), sdap: sdap || null };
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return embedBytes(u8(imageDataOrPixels), bytes);
}

/** Dashboard: pull {callsign, glyph, sdap} out, or null if no OTR payload. */
export function revealImagePayload(imageDataOrPixels) {
  const bytes = extractBytes(u8(imageDataOrPixels));
  if (!bytes) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (obj.v !== 1) return null;
    return { callsign: obj.callsign || "", glyph: obj.glyph || "", sdap: obj.sdap || null };
  } catch {
    return null;
  }
}

export const CODEC_INFO = Object.freeze({ MAGIC, VERSION, HEADER_BYTES });
