export const metadata = {
  title: "Syarat & Ketentuan — Canclip",
  description: "Syarat dan ketentuan penggunaan aplikasi Canclip",
};

export default function TermsPage() {
  return (
    <main className="flex-1 w-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-100">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Syarat & Ketentuan Canclip</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">
          Terakhir diperbarui: 28 Agustus 2026
        </p>

        <p className="mb-6 leading-7">
          Dengan menggunakan aplikasi Canclip ("Aplikasi"), kamu setuju
          dengan syarat &amp; ketentuan berikut. Kalau kamu tidak setuju,
          mohon untuk tidak menggunakan Aplikasi.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">1. Tanggung Jawab atas Konten</h2>
        <p className="mb-4 leading-7">
          Kamu bertanggung jawab penuh atas semua media (video, audio, atau
          link) yang kamu masukkan ke Aplikasi, baik lewat unggah galeri/file
          maupun fitur tempel link. Dengan menggunakan Aplikasi, kamu
          menyatakan bahwa:
        </p>
        <ul className="list-disc pl-6 space-y-2 leading-7">
          <li>Kamu adalah pemilik konten tersebut, atau</li>
          <li>Kamu memiliki izin/lisensi yang sah untuk mengunggah, memproses, dan mengunduh hasil olahannya.</li>
        </ul>
        <p className="mt-4 leading-7">
          Canclip <b>tidak memverifikasi kepemilikan hak cipta</b> atas
          konten yang diproses penggunanya. Tanggung jawab hukum atas
          pelanggaran hak cipta sepenuhnya berada pada pengguna yang
          memasukkan konten tersebut, bukan pada Canclip.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">2. Penggunaan yang Dilarang</h2>
        <p className="mb-4 leading-7">Kamu dilarang menggunakan Aplikasi untuk:</p>
        <ul className="list-disc pl-6 space-y-2 leading-7">
          <li>Memproses konten yang melanggar hak cipta pihak lain tanpa izin</li>
          <li>Menyebarkan ulang hasil klip untuk tujuan yang melanggar hukum</li>
          <li>Mengganggu, membebani berlebihan, atau menyalahgunakan infrastruktur/server Aplikasi</li>
        </ul>

        <h2 className="text-xl font-semibold mt-10 mb-3">3. Akun & Perangkat</h2>
        <p className="leading-7">
          Setiap akun (via login Google) terikat ke 1 perangkat pada satu
          waktu. Percobaan berbagi akun ke banyak perangkat dapat
          menyebabkan akses diblokir sementara. Kamu bertanggung jawab
          menjaga keamanan akun kamu sendiri.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">4. Pembayaran</h2>
        <p className="leading-7">
          Paket "Lifetime" bersifat sekali bayar dan tidak dapat
          dikembalikan (non-refundable) setelah akses aktif, kecuali diatur
          lain oleh hukum yang berlaku. Detail paket lain (jika ada) akan
          dijelaskan pada saat pembelian.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">5. Pemrosesan oleh Pihak Ketiga</h2>
        <p className="leading-7">
          Video/audio yang kamu proses dikirim ke penyedia AI pihak ketiga
          (Groq) untuk transkripsi dan deteksi highlight. Lihat{" "}
          <a href="/privacy" className="underline">Kebijakan Privasi</a>{" "}
          kami untuk detail lengkap.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">6. Klaim Hak Cipta</h2>
        <p className="leading-7">
          Kalau kamu adalah pemegang hak cipta dan merasa kontenmu diproses
          tanpa izin lewat Aplikasi, silakan ajukan laporan lewat halaman{" "}
          <a href="/dmca" className="underline">Laporan Hak Cipta</a>.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">7. Pembatasan Tanggung Jawab</h2>
        <p className="leading-7">
          Aplikasi disediakan "sebagaimana adanya". Kami tidak menjamin
          Aplikasi bebas dari gangguan/error, dan tidak bertanggung jawab
          atas kerugian yang timbul dari penggunaan konten yang diproses
          oleh pengguna secara melawan hukum.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">8. Penghentian Akses</h2>
        <p className="leading-7">
          Kami berhak menangguhkan atau menghentikan akses akun yang
          terbukti melanggar syarat &amp; ketentuan ini, termasuk namun
          tidak terbatas pada pelanggaran hak cipta berulang.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">9. Perubahan Ketentuan</h2>
        <p className="leading-7">
          Kami dapat memperbarui syarat &amp; ketentuan ini sewaktu-waktu.
          Perubahan akan diumumkan lewat pembaruan di halaman ini.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">10. Kontak</h2>
        <p className="leading-7">
          Pertanyaan soal syarat &amp; ketentuan ini? Hubungi kami lewat
          TikTok{" "}
          <a href="https://www.tiktok.com/@clippostt_" className="underline">
            @clippostt_
          </a>
          .
        </p>
      </div>
    </main>
  );
}
