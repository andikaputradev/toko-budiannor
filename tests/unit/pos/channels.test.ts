import { describe, expect, it } from 'vitest';
import { channelsOf, isValidChannel, rowKey } from '../../../src/apps/pos/domain/channels';

describe('kanal pembayaran', () => {
  it('kanal QRIS: Gopay, OVO, Shopee Pay; kanal Transfer: BCA, BRI, Mandiri; EDC dan Tunai tanpa kanal', () => {
    expect(channelsOf('qris')).toEqual(['Gopay', 'OVO', 'Shopee Pay']);
    expect(channelsOf('transfer')).toEqual(['BCA', 'BRI', 'Mandiri']);
    expect(channelsOf('edc')).toEqual([]);
    expect(channelsOf('tunai')).toEqual([]);
  });

  it('isValidChannel menerima kanal milik metodenya dan menolak milik metode lain', () => {
    expect(isValidChannel('transfer', 'BCA')).toBe(true);
    expect(isValidChannel('qris', 'OVO')).toBe(true);
    expect(isValidChannel('transfer', 'OVO')).toBe(false);
    expect(isValidChannel('qris', 'BCA')).toBe(false);
    expect(isValidChannel('tunai', 'BCA')).toBe(false);
    expect(isValidChannel('edc', 'Gopay')).toBe(false);
  });

  it('isValidChannel selalu menerima kanal kosong (QRIS umum, EDC, tunai, transfer lama)', () => {
    for (const method of ['tunai', 'qris', 'edc', 'transfer'] as const) {
      expect(isValidChannel(method, undefined)).toBe(true);
    }
  });

  it('rowKey membedakan Transfer BCA dan Transfer BRI dan memperlakukan kanal kosong sebagai tanpa kanal', () => {
    expect(rowKey({ method: 'transfer', channel: 'BCA' })).not.toBe(
      rowKey({ method: 'transfer', channel: 'BRI' }),
    );
    expect(rowKey({ method: 'transfer', channel: 'BCA' })).not.toBe(rowKey({ method: 'transfer' }));
    expect(rowKey({ method: 'qris' })).toBe(rowKey({ method: 'qris', channel: undefined }));
    expect(rowKey({ method: 'tunai' })).not.toBe(rowKey({ method: 'qris' }));
  });
});
