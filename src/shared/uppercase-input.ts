// Isian teks di POS dan Back-Office memakai huruf kapital (dokumen "Revisi Final POS", catatan
// tambahan). Nilai isian ikut diubah, bukan hanya tampilannya, supaya yang tersimpan, tercetak di
// struk, dan tampil di daftar sama dengan yang diketik. Hanya isian teks biasa, pencarian, dan
// area teks; kata sandi, angka, tanggal, nama pengguna, dan email tidak diubah. Isian lain yang
// tidak boleh diubah diberi atribut data-keep-case.
interface FieldTraits {
  readonly type: string;
  readonly autocomplete: string;
  readonly inputMode: string;
  readonly dataset: Readonly<Record<string, string | undefined>>;
}

export function wantsUppercase(field: FieldTraits): boolean {
  return (
    ['text', 'search', 'textarea'].includes(field.type) &&
    field.dataset['keepCase'] === undefined &&
    field.autocomplete !== 'username' &&
    field.inputMode !== 'email'
  );
}

let installed = false;

export function installUppercaseInputs(doc: Document = document): void {
  if (installed) {
    return;
  }
  installed = true;
  // Fase tangkap: pendengar milik isian sendiri sudah membaca nilai huruf kapital.
  doc.addEventListener(
    'input',
    ({ target: field }) => {
      if (
        (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
        ['pos', 'bo'].includes(doc.documentElement.dataset['app'] ?? '') &&
        wantsUppercase(field)
      ) {
        const { selectionStart: from, selectionEnd: to } = field;
        field.value = field.value.toUpperCase();
        field.setSelectionRange(from, to);
      }
    },
    true,
  );
}
