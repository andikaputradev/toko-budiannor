// Kode QR simulasi: gambar yang mirip kode QR dan tidak dapat dipindai (A-3). Tiga pola sudut
// tetap, sisanya acak yang ditentukan seed sehingga seed yang sama selalu menggambar hal yang sama.
const FINDER = 7;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Sel pola sudut atau sel kosong di sekelilingnya; undefined bila sel itu bebas.
function finderCell(row: number, column: number, size: number): boolean | undefined {
  const corners: readonly (readonly [number, number])[] = [
    [0, 0],
    [0, size - FINDER],
    [size - FINDER, 0],
  ];
  for (const [top, left] of corners) {
    const inRow = row - top;
    const inColumn = column - left;
    if (inRow < -1 || inRow > FINDER || inColumn < -1 || inColumn > FINDER) {
      continue;
    }
    if (inRow < 0 || inRow >= FINDER || inColumn < 0 || inColumn >= FINDER) {
      return false;
    }
    return (
      inRow === 0 ||
      inRow === FINDER - 1 ||
      inColumn === 0 ||
      inColumn === FINDER - 1 ||
      (inRow >= 2 && inRow <= 4 && inColumn >= 2 && inColumn <= 4)
    );
  }
  return undefined;
}

export function qrMatrix(seed: string, size = 25): readonly (readonly boolean[])[] {
  const next = randomFrom(seed);
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => finderCell(row, column, size) ?? next() < 0.5),
  );
}

// Reference ID yang tampil di layar Scan QR Code: QR diikuti sepuluh angka dari seed.
export function qrReference(seed: string): string {
  const next = randomFrom(`ref|${seed}`);
  const digits = Array.from({ length: 10 }, () => String(Math.floor(next() * 10)));
  return `QR${digits.join('')}`;
}
