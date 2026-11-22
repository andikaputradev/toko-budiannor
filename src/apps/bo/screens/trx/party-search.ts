import { matchesPhrase } from '../../../../shared/data/search-index';
import type { Customer, Supplier } from '../../../../shared/data/types';
import { createCombo } from './combo-search';

export interface PartyEntry {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly phone: string;
}

export const customerParties = (customers: readonly Customer[]): PartyEntry[] =>
  customers.map((item) => ({ id: item.id, name: item.name, code: item.code, phone: item.phone }));

export const supplierParties = (suppliers: readonly Supplier[]): PartyEntry[] =>
  suppliers.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code ?? '',
    phone: item.phone,
  }));

// Nota contoh Daftar Nota memuat nama yang belum tentu ada di master: pilihannya bernilai "@Nama"
// supaya nama tetap tampil dan ikut tersimpan pada salinan dokumen.
export const NAMED_PARTY = '@';

export interface PartySearchOptions {
  readonly parties: () => readonly PartyEntry[];
  readonly placeholder: string;
  readonly emptyText: string;
  readonly listLabel: string;
  readonly onChange?: () => void;
}

export interface PartySearch {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  // Id pihak terpilih, "@Nama" untuk nama di luar master, kosong bila belum memilih.
  value(): string;
  // Nama pihak terpilih, sama dengan teks yang tampil di kotak.
  name(): string;
  // Mengisi pilihan tanpa memicu onChange; pemanggil menghitung ulang sendiri.
  set(id: string | undefined, name: string): void;
}

// Kolom Pelanggan atau Pemasok kepala dokumen: dicari seperti nama barang (kata boleh potongan,
// urutan bebas) dan dipilih dari daftar. Teks yang diketik tanpa memilih dikembalikan ke pilihan
// terakhir saat kolom ditinggalkan; mengosongkan kolom menghapus pilihan.
export function createPartySearch(options: PartySearchOptions): PartySearch {
  let chosenId = '';
  let chosenName = '';

  const combo = createCombo<PartyEntry>({
    find: (text) =>
      options
        .parties()
        .filter((party) => matchesPhrase(`${party.name} ${party.code} ${party.phone}`, text)),
    name: (party) => party.name,
    detail: (party) => party.phone || '-',
    onPick: (party) => {
      chosenId = party.id;
      chosenName = party.name;
      combo.input.value = party.name;
      options.onChange?.();
    },
    placeholder: options.placeholder,
    emptyText: options.emptyText,
    listLabel: options.listLabel,
    minQuery: 0,
    onLeave: () => {
      if (combo.input.value.trim() === '' && chosenId !== '') {
        chosenId = '';
        chosenName = '';
        options.onChange?.();
      }
      combo.input.value = chosenName;
    },
  });
  combo.root.classList.add('bo-trx-search--party');

  return {
    root: combo.root,
    input: combo.input,
    value: () => chosenId,
    name: () => chosenName,
    set: (id, name) => {
      const party = options.parties().find((item) => item.id === id);
      if (party !== undefined) {
        chosenId = party.id;
        chosenName = party.name;
      } else if (name !== '') {
        chosenId = `${NAMED_PARTY}${name}`;
        chosenName = name;
      } else {
        chosenId = '';
        chosenName = '';
      }
      combo.input.value = chosenName;
    },
  };
}
