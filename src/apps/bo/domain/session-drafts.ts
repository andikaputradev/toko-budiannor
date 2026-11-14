// Catatan sementara satu sesi BO yang dibagi antar layar Transaksi. Modul kecil ini dimuat bersama
// kerangka BO supaya `disposeWorkspace` bisa mengosongkannya tanpa menarik layar Transaksi.

// Benih Surat Jalan: Faktur Penjualan mengisinya saat "Isi SJ Ekspedisi" dan layar Surat Jalan
// membacanya menurut nomor faktur. Kosong bila Surat Jalan dibuka tanpa melewati faktur.
export interface ExpeditionSeed {
  readonly invoiceNumber: string;
  readonly date: string;
  readonly expedition: string;
  readonly customerName: string;
  readonly customerAddress: string;
  readonly customerPhone: string;
  readonly koliLines: readonly {
    readonly productName: string;
    readonly quantity: number;
    readonly unit: string;
  }[];
}

export const expeditionSeeds = new Map<string, ExpeditionSeed>();

// Nomor SO yang sudah diimpor ke Faktur Penjualan pada sesi ini (Daftar SO menampilkannya Selesai).
export const importedSoNumbers = new Set<string>();

// Versi benih Surat Jalan: dipakai sebagai query supaya "Isi SJ Ekspedisi" yang diklik lagi untuk
// faktur yang sama membangun ulang panel Surat Jalan dengan benih terbaru.
let seedVersion = 0;

export function nextSeedVersion(): number {
  seedVersion += 1;
  return seedVersion;
}

export function resetSessionDrafts(): void {
  expeditionSeeds.clear();
  importedSoNumbers.clear();
}
