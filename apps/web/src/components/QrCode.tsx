const SIZE = 25;
const QUIET = 2;

function makeMatrix(): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => false),
  );

  let seed = 0x5eed1234;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      matrix[y]![x] = random() > 0.48;
    }
  }

  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matrix[oy + y]![ox + x] = edge || core;
      }
    }
  };

  finder(0, 0);
  finder(SIZE - 7, 0);
  finder(0, SIZE - 7);

  for (let i = 0; i < 8; i += 1) {
    matrix[7]![i] = false;
    matrix[i]![7] = false;
    matrix[7]![SIZE - 1 - i] = false;
    matrix[i]![SIZE - 8] = false;
    matrix[SIZE - 8]![i] = false;
    matrix[SIZE - 1 - i]![7] = false;
  }

  for (let i = 8; i < SIZE - 8; i += 1) {
    matrix[6]![i] = i % 2 === 0;
    matrix[i]![6] = i % 2 === 0;
  }

  return matrix;
}

const MATRIX = makeMatrix();

export function QrCode() {
  return (
    <svg
      viewBox={`0 0 ${SIZE + QUIET * 2} ${SIZE + QUIET * 2}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={SIZE + QUIET * 2} height={SIZE + QUIET * 2} fill="#ffffff" />
      {MATRIX.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x + QUIET}
              y={y + QUIET}
              width={1}
              height={1}
              fill="#0d253d"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
