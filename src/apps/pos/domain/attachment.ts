import { formatDecimal } from '../../../shared/format';

export interface AttachmentFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export type AttachmentCheck = 'ok' | 'format' | 'ukuran';

const MB = 1024 * 1024;

// Format lampiran Catat Biaya: gambar JPG, JPEG, PNG sampai 3 MB dan PDF sampai 1 MB.
const RULES: Readonly<Record<string, { readonly mime: string; readonly maxSize: number }>> = {
  jpg: { mime: 'image/jpeg', maxSize: 3 * MB },
  jpeg: { mime: 'image/jpeg', maxSize: 3 * MB },
  png: { mime: 'image/png', maxSize: 3 * MB },
  pdf: { mime: 'application/pdf', maxSize: 1 * MB },
};

// Format ditentukan dari ekstensi nama berkas dan, bila peramban melaporkannya, jenis MIME-nya;
// format diperiksa sebelum ukuran, dan berkas kosong dianggap tidak sah (ukuran).
export function validateAttachment(file: AttachmentFile): AttachmentCheck {
  const dot = file.name.lastIndexOf('.');
  const rule = dot < 0 ? undefined : RULES[file.name.slice(dot + 1).toLowerCase()];
  if (rule === undefined || (file.type !== '' && file.type.toLowerCase() !== rule.mime)) {
    return 'format';
  }
  return file.size > 0 && file.size <= rule.maxSize ? 'ok' : 'ukuran';
}

// Ukuran berkas untuk tampilan: "900 B", "2,0 KB", "1,5 MB".
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${formatDecimal(bytes, 0)} B`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes.toFixed(1) !== '1024.0' && kilobytes < 1024) {
    return `${formatDecimal(kilobytes, 1, 1)} KB`;
  }
  return `${formatDecimal(bytes / MB, 1, 1)} MB`;
}
