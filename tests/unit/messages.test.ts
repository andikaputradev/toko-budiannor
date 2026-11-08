import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import teksBaru from '../../docs/teks-baru.md?raw';
import copyAssets from '../../scripts/copy-assets.mjs?raw';
import { ICON_NAMES } from '../../src/shared/icons';
import {
  label,
  labels,
  message,
  messageParameters,
  systemMessages,
  type SystemMessageId,
} from '../../src/shared/messages';

const ids = Object.keys(systemMessages);

describe('katalog pesan sistem Lampiran C', () => {
  it('memuat tepat 120 pesan berurutan MSG-001 sampai MSG-120', () => {
    expect(ids).toHaveLength(120);
    ids.forEach((id, index) => {
      expect(id).toBe(`MSG-${String(index + 1).padStart(3, '0')}`);
    });
  });

  it('memuat teks persis seperti Lampiran C untuk pesan acuan', () => {
    expect(systemMessages['MSG-001']).toBe(
      'Tidak ada koneksi internet. Perubahan tidak dapat disimpan sampai koneksi pulih.',
    );
    expect(systemMessages['MSG-004']).toBe(
      'Mode offline: transaksi tetap berjalan dan akan dikirim otomatis saat internet pulih. Antrean: 3 transaksi.',
    );
    expect(systemMessages['MSG-017']).toBe('Struk draf: STRUK DRAF, BUKAN BUKTI BAYAR');
    expect(systemMessages['MSG-035']).toBe(
      'Transaksi piutang ditolak: jumlah piutang Rp 1.200.000 melebihi sisa limit Rp 500.000.',
    );
    expect(systemMessages['MSG-094']).toBe(
      'Barang B0003 belum punya barcode. Isi barcode di Satuan dan Harga Bertingkat.',
    );
    expect(systemMessages['MSG-116']).toBe('Alamat IP tidak valid. Contoh: 192.168.1.50.');
    expect(systemMessages['MSG-120']).toBe('Ketik minimal 2 karakter untuk mencari.');
  });

  it('tidak memuat em dash, en dash, atau spasi ganda', () => {
    for (const text of Object.values(systemMessages)) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
      expect(text).not.toContain('  ');
    }
  });

  it('mengembalikan teks contoh persis bila nilai tidak diberikan', () => {
    for (const id of ids) {
      expect(message(id as SystemMessageId)).toBe(systemMessages[id as SystemMessageId]);
    }
  });

  it('mengganti nilai contoh dengan nilai sebenarnya', () => {
    expect(message('MSG-004', { antrean: 7 })).toContain('Antrean: 7 transaksi.');
    expect(message('MSG-008', { nomor: 'B-0012' })).toBe('Bill B-0012 ditahan.');
    expect(message('MSG-023', { sisa: 1 })).toBe('PIN salah. Sisa percobaan: 1.');
    expect(message('MSG-033', { jumlah: 'Rp 75.000' })).toBe(
      'Pembayaran kurang Rp 75.000. Tambah pembayaran atau pilih Piutang.',
    );
    expect(message('MSG-035', { piutang: 'Rp 2.000.000', sisaLimit: 'Rp 0' })).toBe(
      'Transaksi piutang ditolak: jumlah piutang Rp 2.000.000 melebihi sisa limit Rp 0.',
    );
  });

  it('menjaga setiap parameter agar contohnya benar-benar ada pada teks', () => {
    for (const [id, parameters] of Object.entries(messageParameters)) {
      for (const parameter of parameters) {
        expect(systemMessages[id as SystemMessageId]).toContain(parameter.example);
      }
    }
  });
});

describe('teks antarmuka baru', () => {
  it('mencatat setiap label katalog di docs/teks-baru.md', () => {
    for (const text of Object.values(labels)) {
      expect(teksBaru).toContain(`"${text}"`);
    }
  });

  it('tidak memuat em dash atau en dash', () => {
    for (const text of Object.values(labels)) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('mengisi label bertemplat', () => {
    expect(label('pinTercatat', { jumlah: 2, maks: 6 })).toBe('2 dari 6 angka dimasukkan');
  });
});

describe('sprite ikon', () => {
  it('memuat setiap ikon yang dipakai komponen pada skrip salin aset', () => {
    for (const name of ICON_NAMES) {
      expect(copyAssets).toContain(`'${name}'`);
    }
  });
});

describe('sprite ikon putaran kedua', () => {
  const NEW_ICONS = [
    'funnel',
    'users',
    'settings',
    'qr-code',
    'mail',
    'calendar',
    'image-plus',
    'paperclip',
    'lock',
    'smartphone',
    'database',
    'layout-grid',
    'list',
    'sun',
    'moon',
    'monitor',
    'arrow-left',
    'chevron-right',
    'credit-card',
  ];

  it('ICON_NAMES memuat ikon baru yang dipakai putaran kedua', () => {
    for (const name of NEW_ICONS) {
      expect(ICON_NAMES, name).toContain(name);
    }
  });

  it('sprite.svg memuat simbol untuk setiap ikon di ICON_NAMES', () => {
    const sprite = readFileSync('public/icons/sprite.svg', 'utf8');
    for (const name of ICON_NAMES) {
      expect(sprite, name).toContain(`<symbol id="${name}"`);
    }
  });
});
