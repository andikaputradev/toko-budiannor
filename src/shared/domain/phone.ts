// Nomor telepon untuk kirim PDF lewat WhatsApp (Sales dan Owner).

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

export function isValidPhone(raw: string): boolean {
  return /^(08\d{7,12}|\+?628\d{7,12})$/.test(normalizePhone(raw));
}
