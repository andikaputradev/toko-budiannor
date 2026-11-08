import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../../src/shared/data/generator';
import { withProposalData } from '../../../src/shared/data/proposal';
import { createStore } from '../../../src/shared/store/store';
import { qrMatrix, qrReference } from '../../../src/apps/pos/domain/qr';
import { createPosSession } from '../../../src/apps/pos/pos-session';

const dataset = withProposalData(generateDataset());

function finderAt(matrix: readonly (readonly boolean[])[], top: number, left: number): boolean[][] {
  return Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => matrix[top + row]?.[left + column] === true),
  );
}

function expectedFinder(): boolean[][] {
  return Array.from({ length: 7 }, (_, row) =>
    Array.from(
      { length: 7 },
      (_, column) =>
        row === 0 ||
        row === 6 ||
        column === 0 ||
        column === 6 ||
        (row >= 2 && row <= 4 && column >= 2 && column <= 4),
    ),
  );
}

describe('matriks QR simulasi', () => {
  it('berukuran 25 x 25 secara bawaan dan mengikuti ukuran yang diminta', () => {
    const matrix = qrMatrix('T-000141');
    expect(matrix).toHaveLength(25);
    for (const row of matrix) {
      expect(row).toHaveLength(25);
    }
    expect(qrMatrix('T-000141', 29)).toHaveLength(29);
  });

  it('tiga pola sudut ada pada posisi tetap untuk seed apa pun', () => {
    for (const seed of ['T-000141', 'seed lain', '']) {
      const matrix = qrMatrix(seed);
      for (const [top, left] of [
        [0, 0],
        [0, 18],
        [18, 0],
      ] as const) {
        expect(finderAt(matrix, top, left), `${seed} ${String(top)},${String(left)}`).toEqual(
          expectedFinder(),
        );
      }
    }
  });

  it('ada satu sel kosong di sekeliling setiap pola sudut', () => {
    const matrix = qrMatrix('T-000141');
    for (let index = 0; index < 8; index += 1) {
      expect(matrix[7]?.[index]).toBe(false);
      expect(matrix[index]?.[7]).toBe(false);
      expect(matrix[7]?.[24 - index]).toBe(false);
      expect(matrix[index]?.[17]).toBe(false);
      expect(matrix[17]?.[index]).toBe(false);
      expect(matrix[24 - index]?.[7]).toBe(false);
    }
  });

  it('seed sama menghasilkan matriks sama', () => {
    expect(qrMatrix('T-000141|Gopay')).toEqual(qrMatrix('T-000141|Gopay'));
  });

  it('seed berbeda menghasilkan matriks berbeda', () => {
    expect(qrMatrix('T-000141|Gopay')).not.toEqual(qrMatrix('T-000141|OVO'));
  });
});

describe('Reference ID QR', () => {
  it('berbentuk QR diikuti sepuluh angka dan tetap untuk seed yang sama', () => {
    const reference = qrReference('T-000141|Gopay|70000');
    expect(reference).toMatch(/^QR\d{10}$/);
    expect(qrReference('T-000141|Gopay|70000')).toBe(reference);
  });

  it('berbeda untuk seed berbeda', () => {
    expect(qrReference('T-000141|Gopay|70000')).not.toBe(qrReference('T-000141|OVO|70000'));
  });
});

describe('nomor penjualan berikutnya', () => {
  it('sama dengan nomor yang dipakai penjualan yang diselesaikan, lalu maju satu', () => {
    const store = createStore({ dataset });
    store.setUser('U-3');
    const session = createPosSession(store, { clock: () => 1_000_000 });
    session.startShift(100000);
    const product = dataset.products.find((item) => item.id === 'P-01');
    if (product === undefined) {
      throw new Error('barang proposal tidak ada');
    }
    session.addProduct(product, 'SAK', 1);
    session.chooseSingle('qris', 'Gopay');
    const planned = session.nextSaleNumber();
    expect(planned).toMatch(/^T-\d{6}$/);
    const sale = session.finish();
    expect(sale?.number).toBe(planned);
    expect(session.nextSaleNumber()).not.toBe(planned);
  });
});
