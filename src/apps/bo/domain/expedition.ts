import { nextLineId } from './doc-line';
import { parseQuantityText } from './line-detail';

export { expeditionSeeds, nextSeedVersion, type ExpeditionSeed } from './session-drafts';

// Surat Jalan Ekspedisi dan Packing Koli (gambar klien 13): tabel datar Jumlah, Satuan, Nama Barang.
export interface ExpeditionLine {
  readonly id: string;
  readonly quantity: number;
  readonly unit: string;
  readonly name: string;
}

export interface ExpeditionNote {
  readonly noteNumber: string;
  readonly invoiceNumber: string;
  readonly date: string;
  // Driver dan nomor polisi dalam satu isian, mis. "Pak Budi (DA 8812 PB)".
  readonly vehicle: string;
  readonly expeditionName: string;
  // "Nama - Alamat (Telepon)"; bagian yang kosong dilewati.
  readonly recipient: string;
  readonly lines: readonly ExpeditionLine[];
}

export type LineIssue = 'ok' | 'quantity' | 'unit' | 'name';

let sjCounter = 58;

export function generateExpeditionNoteNumber(): string {
  sjCounter += 1;
  return `SJ2610${String(sjCounter).padStart(4, '0')}`;
}

function recipientText(invoice: {
  readonly customerName: string;
  readonly customerAddress: string;
  readonly customerPhone: string;
}): string {
  const name = invoice.customerName.trim();
  const address = invoice.customerAddress.trim();
  const phone = invoice.customerPhone.trim();
  const base = [name, address].filter((part) => part !== '').join(' - ');
  return phone === '' ? base : `${base} (${phone})`.trim();
}

// Catatan baru dari faktur: satu baris datar per barang yang ditandai Koli di Faktur Penjualan.
export function createExpeditionNote(
  invoice: {
    readonly invoiceNumber: string;
    readonly date: string;
    readonly expedition: string;
    readonly customerName: string;
    readonly customerAddress: string;
    readonly customerPhone: string;
  },
  koliLines: readonly {
    readonly productName: string;
    readonly quantity: number;
    readonly unit: string;
  }[],
): ExpeditionNote {
  return {
    noteNumber: generateExpeditionNoteNumber(),
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    vehicle: 'Pak Budi (DA 8812 PB)',
    expeditionName: invoice.expedition === '' ? 'JNE Cargo' : invoice.expedition,
    recipient: recipientText(invoice),
    lines: koliLines.map((line) => ({
      id: nextLineId(),
      quantity: line.quantity,
      unit: line.unit,
      name: line.productName,
    })),
  };
}

// Tanpa id (atau id tak dikenal) menambah baris di akhir; dengan id mengganti di tempatnya.
export function upsertLine(
  note: ExpeditionNote,
  line: Omit<ExpeditionLine, 'id'> & { readonly id?: string },
): ExpeditionNote {
  const known = line.id !== undefined && note.lines.some((item) => item.id === line.id);
  if (known) {
    return {
      ...note,
      lines: note.lines.map((item) =>
        item.id === line.id
          ? { id: item.id, quantity: line.quantity, unit: line.unit, name: line.name }
          : item,
      ),
    };
  }
  return {
    ...note,
    lines: [
      ...note.lines,
      { id: nextLineId(), quantity: line.quantity, unit: line.unit, name: line.name },
    ],
  };
}

export function removeLine(note: ExpeditionNote, id: string): ExpeditionNote {
  return { ...note, lines: note.lines.filter((item) => item.id !== id) };
}

export function validateLine(input: {
  readonly quantity: string;
  readonly unit: string;
  readonly name: string;
}): LineIssue {
  const quantity = parseQuantityText(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'quantity';
  }
  if (input.unit.trim() === '') {
    return 'unit';
  }
  return input.name.trim() === '' ? 'name' : 'ok';
}
