const DEFAULT_RETURN = '/pos/jual';

let pending: string | undefined;

// Layar yang membuka formulir pelanggan baru (mis. daftar Pelanggan) menitipkan rute tujuan setelah
// simpan atau batal; tanpa titipan, formulir kembali ke layar jual.
export function returnAfterCustomerForm(path: string): void {
  pending = path;
}

// Dipanggil sekali oleh formulir saat dibuka; titipan dipakai habis agar tidak bocor ke pembukaan berikutnya.
export function takeCustomerFormReturn(): string {
  const path = pending ?? DEFAULT_RETURN;
  pending = undefined;
  return path;
}
