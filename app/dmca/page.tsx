export const metadata = {
  title: "Laporan Hak Cipta — Canclip",
  description: "Cara melaporkan klaim pelanggaran hak cipta di aplikasi Canclip",
};

export default function DmcaPage() {
  return (
    <main className="flex-1 w-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-100">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Laporan Klaim Hak Cipta</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">
          Terakhir diperbarui: 28 Agustus 2026
        </p>

        <p className="mb-6 leading-7">
          Canclip menghormati hak kekayaan intelektual pihak lain. Kalau kamu
          adalah pemegang hak cipta (atau kuasa hukumnya) dan meyakini bahwa
          konten yang diproses lewat Aplikasi Canclip melanggar hak cipta
          kamu, silakan ajukan laporan dengan menghubungi kami lewat kanal di
          bawah, sertakan informasi berikut:
        </p>

        <ul className="list-disc pl-6 space-y-2 leading-7 mb-8">
          <li>Identitas kamu (nama, dan jika mewakili perusahaan/pihak lain, sertakan buktinya)</li>
          <li>Deskripsi karya berhak cipta yang menurutmu dilanggar</li>
          <li>Link/informasi konten yang diduga melanggar (jika ada)</li>
          <li>Pernyataan bahwa kamu punya itikad baik meyakini penggunaan tersebut tidak diizinkan oleh pemegang hak atau hukum</li>
          <li>Pernyataan bahwa informasi dalam laporanmu akurat, di bawah ancaman sumpah/hukum yang berlaku</li>
          <li>Tanda tangan (fisik atau elektronik)</li>
        </ul>

        <h2 className="text-xl font-semibold mt-10 mb-3">Cara Melapor</h2>
        <p className="leading-7 mb-2">
          Kirim laporan lewat salah satu kanal berikut:
        </p>
        <ul className="list-disc pl-6 space-y-2 leading-7">
          <li>
            TikTok:{" "}
            <a href="https://www.tiktok.com/@clippostt_" className="underline">
              @clippostt_
            </a>{" "}
            (kirim pesan langsung)
          </li>
          <li>
            WhatsApp:{" "}
            <a
              href="https://wa.me/6285719473906?text=Laporan%20Klaim%20Hak%20Cipta%20Canclip"
              className="underline"
            >
              +62 857-1947-3906
            </a>
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-10 mb-3">Proses Penanganan</h2>
        <p className="leading-7">
          Setelah laporan kami terima dan verifikasi, kami akan mengambil
          langkah yang sesuai, termasuk namun tidak terbatas pada:
          menonaktifkan akses ke konten/link terkait, dan/atau menangguhkan
          akun pengguna yang berulang kali melanggar. Kami akan berusaha
          merespons laporan yang valid dalam waktu wajar.
        </p>

        <p className="leading-7 mt-6">
          Lihat juga{" "}
          <a href="/terms" className="underline">Syarat &amp; Ketentuan</a>{" "}
          dan{" "}
          <a href="/privacy" className="underline">Kebijakan Privasi</a>{" "}
          kami.
        </p>
      </div>
    </main>
  );
}
