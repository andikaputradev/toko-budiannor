import type { SalesInvoiceDraft } from './sales-transaction';

export interface KoliItem {
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
}

export interface KoliPackage {
  readonly koliIndex: number;
  readonly packageType: string;
  readonly title: string;
  readonly weightKg: number;
  readonly items: readonly KoliItem[];
}

export interface ExpeditionNote {
  readonly noteNumber: string;
  readonly invoiceNumber: string;
  readonly date: string;
  readonly expeditionName: string;
  readonly driverName: string;
  readonly vehiclePlate: string;
  readonly recipientName: string;
  readonly destinationAddress: string;
  readonly recipientPhone: string;
  readonly koliList: readonly KoliPackage[];
  readonly totalKoli: number;
  readonly totalWeightKg: number;
}

let sjCounter = 58;

export function generateExpeditionNoteNumber(): string {
  sjCounter += 1;
  return `SJ2610${String(sjCounter).padStart(4, '0')}`;
}

export function createDefaultExpeditionFromInvoice(
  invoice: SalesInvoiceDraft,
  date = invoice.date,
): ExpeditionNote {
  const noteNumber = generateExpeditionNoteNumber();

  // Buat default koli dari baris faktur
  const items: KoliItem[] = invoice.lines.map((l) => ({
    name: l.productName,
    quantity: l.quantity,
    unit: l.unit,
  }));

  const defaultKoli: KoliPackage = {
    koliIndex: 1,
    packageType: 'Dus / Campur',
    title:
      items.length > 0
        ? `Barang Campur (${items
            .map((i) => i.name)
            .slice(0, 3)
            .join(' / ')})`
        : 'Barang Campur',
    weightKg: Math.max(
      5,
      items.reduce((acc, curr) => acc + curr.quantity * 2, 0),
    ),
    items,
  };

  return {
    noteNumber,
    invoiceNumber: invoice.invoiceNumber,
    date,
    expeditionName: invoice.expedition || 'JNE Cargo',
    driverName: 'Pak Budi',
    vehiclePlate: 'DA 8812 PB',
    recipientName: invoice.customerName || 'Pelanggan',
    destinationAddress: invoice.customerAddress || 'Alamat Proyek',
    recipientPhone: invoice.customerPhone || '',
    koliList: items.length > 0 ? [defaultKoli] : [],
    totalKoli: items.length > 0 ? 1 : 0,
    totalWeightKg: items.length > 0 ? defaultKoli.weightKg : 0,
  };
}

export function addKoliPackage(current: ExpeditionNote, pkg: KoliPackage): ExpeditionNote {
  const nextList = [...current.koliList, pkg];
  const totalWeightKg = nextList.reduce((acc, k) => acc + (k.weightKg || 0), 0);
  return {
    ...current,
    koliList: nextList,
    totalKoli: nextList.length,
    totalWeightKg,
  };
}
