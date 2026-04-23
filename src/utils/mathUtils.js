/**
 * >>> W-Y EVANSCIRA LABS // SDAP-7 HOMOGRAPHY SOLVER
 * Calculates a 4-point perspective transform matrix to map a 2D rectangle
 * to an arbitrary quadrilateral in 3D space.
 */

export default function solveHomography(corners) {
  if (!corners || corners.length !== 4) return null;

  // The base resolution of the ArtPlane (240x240)
  const w = 240;
  const h = 240;

  const dst = corners;

  // Algebraic resolution for mapping a rectangle to a quadrilateral
  const dx1 = dst[1].x - dst[2].x;
  const dx2 = dst[3].x - dst[2].x;
  const dx3 = dst[0].x - dst[1].x + dst[2].x - dst[3].x;

  const dy1 = dst[1].y - dst[2].y;
  const dy2 = dst[3].y - dst[2].y;
  const dy3 = dst[0].y - dst[1].y + dst[2].y - dst[3].y;

  let a13 = dst[0].x;
  let a23 = dst[0].y;
  let a33 = 1;

  let a11, a12, a21, a22, a31, a32;

  if (dx3 === 0 && dy3 === 0) {
    // Affine transformation (flat 2D plane)
    a11 = dst[1].x - dst[0].x;
    a21 = dst[1].y - dst[0].y;
    a31 = 0;
    a12 = dst[2].x - dst[1].x;
    a22 = dst[2].y - dst[1].y;
    a32 = 0;
  } else {
    // Perspective transformation (3D tilt)
    const det1 = dx1 * dy2 - dy1 * dx2;
    if (det1 === 0) return null; // Avoid division by zero on matrix collapse

    a31 = (dx3 * dy2 - dy3 * dx2) / det1;
    a32 = (dx1 * dy3 - dy1 * dx3) / det1;

    a11 = dst[1].x - dst[0].x + a31 * dst[1].x;
    a21 = dst[1].y - dst[0].y + a31 * dst[1].y;
    a12 = dst[3].x - dst[0].x + a32 * dst[3].x;
    a22 = dst[3].y - dst[0].y + a32 * dst[3].y;
  }

  // Normalize by the base width and height
  a11 /= w;
  a21 /= w;
  a31 /= w;
  a12 /= h;
  a22 /= h;
  a32 /= h;

  // Map to CSS matrix3d sequence
  // Note: CSS matrix3d is column-major
  const H = [
    a11, a21, 0, a31,
    a12, a22, 0, a32,
    0,   0,   1, 0,
    a13, a23, 0, a33
  ];

  // Truncate to 5 decimals to prevent CSS parser scientific notation errors
  const formatNum = (n) => Number(n.toFixed(5));
  
  return `matrix3d(${H.map(formatNum).join(', ')})`;
}
