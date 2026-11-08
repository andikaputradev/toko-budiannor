import { describe, expect, it } from 'vitest';
import { formatFileSize, validateAttachment } from '../../../src/apps/pos/domain/attachment';

const MB = 1024 * 1024;

describe('validateAttachment', () => {
  it('menerima JPG dan PNG sampai 3 MB', () => {
    expect(validateAttachment({ name: 'nota.jpg', size: 1024, type: 'image/jpeg' })).toBe('ok');
    expect(validateAttachment({ name: 'nota.jpeg', size: 3 * MB, type: 'image/jpeg' })).toBe('ok');
    expect(validateAttachment({ name: 'nota.png', size: 3 * MB, type: 'image/png' })).toBe('ok');
    expect(validateAttachment({ name: 'FOTO.JPG', size: 500, type: 'image/jpeg' })).toBe('ok');
    expect(validateAttachment({ name: 'nota.pdf', size: 1 * MB, type: 'application/pdf' })).toBe(
      'ok',
    );
    expect(validateAttachment({ name: 'nota.png', size: 2048, type: '' })).toBe('ok');
  });

  it('menolak JPG di atas 3 MB dan PDF di atas 1 MB', () => {
    expect(validateAttachment({ name: 'nota.jpg', size: 3 * MB + 1, type: 'image/jpeg' })).toBe(
      'ukuran',
    );
    expect(validateAttachment({ name: 'nota.png', size: 4 * MB, type: 'image/png' })).toBe(
      'ukuran',
    );
    expect(
      validateAttachment({ name: 'nota.pdf', size: 1 * MB + 1, type: 'application/pdf' }),
    ).toBe('ukuran');
    expect(validateAttachment({ name: 'kosong.png', size: 0, type: 'image/png' })).toBe('ukuran');
  });

  it('menolak format selain JPG, JPEG, PNG, PDF', () => {
    expect(validateAttachment({ name: 'nota.gif', size: 1024, type: 'image/gif' })).toBe('format');
    expect(validateAttachment({ name: 'nota.svg', size: 1024, type: 'image/svg+xml' })).toBe(
      'format',
    );
    expect(validateAttachment({ name: 'nota', size: 1024, type: 'image/png' })).toBe('format');
    expect(validateAttachment({ name: 'nota.png.exe', size: 1024, type: '' })).toBe('format');
    expect(validateAttachment({ name: 'nota.png', size: 1024, type: 'application/zip' })).toBe(
      'format',
    );
    expect(validateAttachment({ name: 'nota.pdf', size: 1024, type: 'image/png' })).toBe('format');
  });

  it('memeriksa format sebelum ukuran', () => {
    expect(validateAttachment({ name: 'besar.gif', size: 9 * MB, type: 'image/gif' })).toBe(
      'format',
    );
  });
});

describe('formatFileSize', () => {
  it('menampilkan byte, KB, dan MB dengan koma desimal', () => {
    expect(formatFileSize(900)).toBe('900 B');
    expect(formatFileSize(2048)).toBe('2,0 KB');
    expect(formatFileSize(1536)).toBe('1,5 KB');
    expect(formatFileSize(MB)).toBe('1,0 MB');
    expect(formatFileSize(2.5 * MB)).toBe('2,5 MB');
    expect(formatFileSize(MB - 1)).toBe('1,0 MB');
  });
});
