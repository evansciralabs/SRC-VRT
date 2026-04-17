export const calculateMatrix3D = (w, h, p1, p2, p3, p4) => {
  const sx1 = 0, sy1 = 0;
  const sx2 = w, sy2 = 0;
  const sx3 = w, sy3 = h;
  const sx4 = 0, sy4 = h;

  const dx1 = p1.x, dy1 = p1.y;
  const dx2 = p2.x, dy2 = p2.y;
  const dx3 = p3.x, dy3 = p3.y;
  const dx4 = p4.x, dy4 = p4.y;

  const matrix = [
    sx1, sy1, 1, 0, 0, 0, -dx1 * sx1, -dx1 * sy1,
    0, 0, 0, sx1, sy1, 1, -dy1 * sx1, -dy1 * sy1,
    sx2, sy2, 1, 0, 0, 0, -dx2 * sx2, -dx2 * sy2,
    0, 0, 0, sx2, sy2, 1, -dy2 * sx2, -dy2 * sy2,
    sx3, sy3, 1, 0, 0, 0, -dx3 * sx3, -dx3 * sy3,
    0, 0, 0, sx3, sy3, 1, -dy3 * sx3, -dy3 * sy3,
    sx4, sy4, 1, 0, 0, 0, -dx4 * sx4, -dx4 * sy4,
    0, 0, 0, sx4, sy4, 1, -dy4 * sx4, -dy4 * sy4
  ];

  const rightHandSide = [dx1, dy1, dx2, dy2, dx3, dy3, dx4, dy4];
  const h_vars = solveLinearSystem(matrix, rightHandSide);

  return [
    h_vars[0], h_vars[3], 0, h_vars[6],
    h_vars[1], h_vars[4], 0, h_vars[7],
    0,         0,         1, 0,
    h_vars[2], h_vars[5], 0, 1
  ].map(val => val.toFixed(6)); 
};

function solveLinearSystem(A, b) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k * n + i]) > Math.abs(A[maxRow * n + i])) {
        maxRow = k;
      }
    }
    for (let k = i; k < n; k++) {
      const temp = A[i * n + k];
      A[i * n + k] = A[maxRow * n + k];
      A[maxRow * n + k] = temp;
    }
    const tempB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tempB;

    for (let k = i + 1; k < n; k++) {
      const factor = A[k * n + i] / A[i * n + i];
      b[k] -= factor * b[i];
      for (let j = i; j < n; j++) {
        A[k * n + j] -= factor * A[i * n + j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i * n + j] * x[j];
    }
    x[i] = (b[i] - sum) / A[i * n + i];
  }
  return x;
}
