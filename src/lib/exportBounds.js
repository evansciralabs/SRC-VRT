/**
 * exportBounds.js — compute the tight export rectangle for the render terminal.
 *
 * Rule (per operator spec):
 *   bounds = union of (ground image displayed rect, if any)
 *                   ∪ (every stamped/active design's projected bbox)
 *   → crop export to that union; everything outside/void = transparent.
 *   → no ground image + no designs → null (caller uses a default canvas).
 *
 * Designs are 240×240 boxes transformed by a CSS matrix3d(...) string
 * (from solveHomography). To find where a design actually sits on screen we
 * project its 4 local corners through that matrix (with perspective divide)
 * and take their axis-aligned bounding box. This is the honest way — the
 * transform is a real homography, so a naive width/height won't do.
 *
 * All geometry is framework-free and unit-tested; the DOM measurement half
 * (getBoundingClientRect on the ground <img>) lives in App.jsx since it
 * needs the live element.
 */

const DESIGN_BASE = 240; // ArtPlane base box, matches solveHomography's w/h

/** Parse "matrix3d(a,b,c,...16)" → number[16] (column-major), or null. */
export function parseMatrix3d(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/matrix3d\(([^)]+)\)/);
  if (!m) return null;
  const nums = m[1].split(",").map((s) => parseFloat(s.trim()));
  if (nums.length !== 16 || nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

/**
 * Project a local (x,y) point (z=0,w=1) through a column-major 4x4 matrix,
 * applying the perspective divide. Returns {x,y} in the transformed space.
 * CSS matrix3d is column-major: index = col*4 + row.
 */
export function projectPoint(M, x, y) {
  // p' = M * [x, y, 0, 1]^T  (column-major indexing)
  const X = M[0] * x + M[4] * y + M[12];
  const Y = M[1] * x + M[5] * y + M[13];
  const W = M[3] * x + M[7] * y + M[15];
  const w = W === 0 ? 1e-9 : W;
  return { x: X / w, y: Y / w };
}

/**
 * Given a design's matrix3d string (and its origin offset in screen space),
 * return the axis-aligned bbox {minX,minY,maxX,maxY} of its 4 projected
 * corners. The design box is [0..240]x[0..240] in local space; the matrix
 * already encodes placement, so originX/originY are usually 0 unless the
 * transformed element is itself offset by layout (pass the container's
 * left/top if so).
 */
export function designBBox(matrixStr, originX = 0, originY = 0, base = DESIGN_BASE) {
  const M = parseMatrix3d(matrixStr);
  if (!M) return null;
  const corners = [
    [0, 0], [base, 0], [base, base], [0, base],
  ].map(([x, y]) => {
    const p = projectPoint(M, x, y);
    return { x: p.x + originX, y: p.y + originY };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Union of a list of {minX,minY,maxX,maxY} rects (nulls ignored). */
export function unionRects(rects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const r of rects) {
    if (!r) continue;
    any = true;
    if (r.minX < minX) minX = r.minX;
    if (r.minY < minY) minY = r.minY;
    if (r.maxX > maxX) maxX = r.maxX;
    if (r.maxY > maxY) maxY = r.maxY;
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

/** {left,top,width,height} from a bbox, clamped to integers, with optional pad. */
export function bboxToRect(bbox, pad = 0) {
  if (!bbox) return null;
  const left = Math.floor(bbox.minX - pad);
  const top = Math.floor(bbox.minY - pad);
  const width = Math.ceil(bbox.maxX - bbox.minX + pad * 2);
  const height = Math.ceil(bbox.maxY - bbox.minY + pad * 2);
  return { left, top, width: Math.max(1, width), height: Math.max(1, height) };
}
