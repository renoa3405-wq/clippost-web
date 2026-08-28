export const metadata = {
  title: "Kebijakan Privasi — Canclip",
  description: "Kebijakan privasi aplikasi Canclip",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="flex-1 w-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-100">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Kebijakan Privasi Canclip</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">
          Terakhir diperbarui: 28 Agustus 2026
        </p>

        <p className="mb-6 leading-7">
          Canclip ("kami") adalah aplikasi yang membantu pengguna membuat klip
          video pendek secara otomatis menggunakan AI. Kebijakan ini
          menjelaskan data apa saja yang kami kumpulkan, untuk apa data itu
          dipakai, dan bagaimana kami menjaganya.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">1. Data yang Kami Kumpulkan</h2>
        <ul className="list-disc pl-6 space-y-2 leading-7">
          <li>
            <b>Akun Google:</b> saat login, kami menerima alamat email dan
            informasi dasar akun Google kamu (nama, foto profil) dari Google
            Sign-In. Kami menggunakan email ini untuk mengaitkan status
            langganan/pembayaran kamu.
          </li>
          <li>
            <b>ID Perangkat:</b> kami menyimpan identitas unik perangkat HP
            kamu untuk mencegah 1 akun dipakai berbagi-bagi di banyak
            perangkat sekaligus (device-lock).
          </li>
          <li>
            <b>Video/Audio yang Kamu Unggah atau Tempel Link-nya:</b> file
            video/audio yang kamu pilih dari galeri, file, atau link
            YouTube/TikTok yang kamu tempel, diproses untuk menghasilkan klip
            dan subtitle otomatis.
          </li>
          <li>
            <b>Data Pembayaran:</b> kami tidak menyimpan data kartu/rekening
            kamu secara langsung — pemrosesan pembayaran ditangani oleh
            penyedia pihak ketiga (Lynk.id dan/atau Google Play Billing).
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-10 mb-3">2. Bagaimana Data Diproses</h2>
        <p className="mb-4 leading-7">
          Video dan audio yang kamu proses dikirim ke{" "}
          <b>Groq</b> (penyedia layanan AI pihak ketiga) khusus untuk:
        </p>
        <ul className="list-disc pl-6 space-y-2 leading-7">
          <li>Transkripsi ucapan menjadi teks (speech-to-text)</li>
          <li>Deteksi momen menarik (highlight) dalam video untuk dijadikan klip</li>
        </ul>
        <p className="mt-4 leading-7">
          Kami tidak menjual atau membagikan data pribadi kamu ke pihak
          ketiga untuk tujuan iklan. Canclip tidak memasang SDK
          analitik/iklan pihak ketiga apa pun di dalam aplikasi.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">3. Penyimpanan Data</h2>
        <p className="leading-7">
          Data akun (email, status langganan, ID perangkat) disimpan di
          infrastruktur database kami (Supabase) dengan akses yang dibatasi.
          File video/audio yang kamu proses disimpan sementara di perangkat
          kamu sendiri dan/atau server pemrosesan kami, lalu dihapus secara
          berkala.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">4. Hak Kamu</h2>
        <p className="leading-7">
          Kamu bisa meminta penghapusan akun dan data terkait kapan saja
          dengan menghubungi kami melalui kontak di bawah. Kamu juga bisa
          logout kapan saja dari menu Profil di aplikasi.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">5. Perubahan Kebijakan</h2>
        <p className="leading-7">
          Kami dapat memperbarui kebijakan ini dari waktu ke waktu. Perubahan
          akan diumumkan lewat pembaruan di halaman ini.
        </p>

        <h2 className="text-xl font-semibold mt-10 mb-3">6. Kontak</h2>
        <p className="leading-7">
          Ada pertanyaan soal privasi datamu? Hubungi kami lewat TikTok{" "}
          <a
            href="https://www.tiktok.com/@clippostt_"
            className="underline"
          >
            @clippostt_
          </a>
          .
        </p>
      </div>
    </main>
  );
}
