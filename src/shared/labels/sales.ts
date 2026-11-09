// Teks baru revisi mobile Sales (katalog, order, riwayat). Semua kunci diawali "sls".
// Kunci stokToko dan stokGudang pada labels/mobile.ts tertimpa 'Toko' dan 'Gudang' di messages.ts,
// jadi kartu katalog memakai kunci sendiri.
export const salesLabels = {
  // Katalog
  slsCariBarang: 'Cari kode / nama barang',
  slsTierMengikuti: 'Tier harga mengikuti pelanggan',
  slsChipDisplay: 'Display (toko)',
  slsChipBesar: 'Besar (gudang)',
  slsStokToko: 'STOK TOKO',
  slsStokGudang: 'STOK GUDANG',
  slsHargaPerSatuan: 'Harga per {satuan} (Rp)',
  slsSatuanSetara: '1 {satuan} = {faktor} {dasar}',
  slsLihatOrder: 'Lihat Order ({jumlah} barang)',
  // Order
  slsOrderKosong: 'Belum ada barang di order',
  slsOrderKosongIsi: 'Cari barang di kolom atas atau pilih dari Katalog.',
  slsBukaKatalog: 'Buka Katalog',
  slsLimitPiutang: 'Limit {limit}, terpakai {terpakai}, sisa {sisa}',
  slsPiutangTerlambat: 'Pelanggan ini ada piutang terlambat {jumlah}, sudah {hari} hari.',
  slsHargaTier: 'Harga tier {tier}: {harga}',
  slsHargaDiubah: 'Harga diubah',
  slsDiBawahTier: 'Di bawah harga tier',
  slsSubtotal: 'Subtotal',
  slsJumlahBarang: '{jumlah} barang',
  slsPiutangPenuh: 'Seluruh total dicatat sebagai piutang pelanggan.',
  slsOfflineSimpan: 'Offline: order disimpan di HP dan dikirim otomatis saat internet pulih.',
  slsPersetujuanHarga: 'Harga di bawah tier',
  slsHargaDiBawahTier: '{nama} dijual {harga} per {satuan}, di bawah harga tier {tier}.',
  slsBarangLainDiBawahTier: 'Dan {jumlah} barang lain juga di bawah harga tier.',
  // Riwayat
  slsSinkronOk: 'Tersinkron',
  slsSinkronMenunggu: 'Menunggu sinkron',
  slsBarisCaraBayar: '{jumlah} barang, {cara}',
  slsRincianBarang: 'Rincian barang',
  slsAlasanPersetujuan: 'Alasan persetujuan Owner',
  slsPilihPrinter: 'Pilih printer Bluetooth di atas terlebih dahulu.',
} as const;
