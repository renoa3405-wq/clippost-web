"use client";

import { useState } from "react";

export default function AdminKnowledgeBase() {
  const [category, setCategory] = useState("FAQ");
  const [pattern, setPattern] = useState("");
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState(""); // State baru untuk password
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSimpan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, pattern, answer, password, confidence: 100, active: true }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ Berhasil disimpan ke Otak AI!");
        setPattern("");
        setAnswer("");
      } else {
        setMessage(`❌ Gagal: ${data.error}`);
      }
    } catch (error) {
      setMessage("❌ Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#FAFAFA] p-8 font-sans">
      <div className="max-w-2xl mx-auto bg-[#18181B] border border-[#3F3F46] rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-[#0D9488] mb-2">Pusat Kendali AI (Protected)</h1>
        <p className="text-[#A1A1AA] mb-8 text-sm">Tambahkan pengetahuan baru. Hanya admin resmi yang memiliki akses ini.</p>

        <form onSubmit={handleSimpan} className="flex flex-col gap-6">
          
          {/* PASSWORD RAHASIA */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-[#F43F5E] uppercase tracking-wider">Admin Secret Password</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password rahasia admin..."
              className="bg-[#27272A] border border-[#F43F5E] rounded-lg p-3 text-white outline-none focus:ring-2 focus:ring-[#F43F5E]"
              required
            />
          </div>

          {/* KATEGORI */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-[#A1A1AA] uppercase tracking-wider">Kategori</label>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#27272A] border border-[#3F3F46] rounded-lg p-3 text-white outline-none focus:border-[#0D9488]"
            >
              <option value="FAQ">FAQ Umum</option>
              <option value="BUG">Bug & Error</option>
              <option value="TUTORIAL">Tutorial</option>
              <option value="PAYMENT">Pembayaran</option>
            </select>
          </div>

          {/* PATTERN / KATA KUNCI */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-[#A1A1AA] uppercase tracking-wider">Pattern (Kata Kunci)</label>
            <textarea 
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Contoh: Harga, Berapa?, 55k?, Berbayar?"
              className="bg-[#27272A] border border-[#3F3F46] rounded-lg p-3 text-white outline-none focus:border-[#0D9488] h-20 resize-none"
              required
            />
          </div>

          {/* JAWABAN */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-[#A1A1AA] uppercase tracking-wider">Jawaban / Solusi</label>
            <textarea 
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Ketik jawaban resmi dari admin di sini..."
              className="bg-[#27272A] border border-[#3F3F46] rounded-lg p-3 text-white outline-none focus:border-[#0D9488] h-40 resize-none"
              required
            />
          </div>

          {/* TOMBOL SIMPAN */}
          <button 
            type="submit" 
            disabled={loading}
            className={`mt-4 p-4 rounded-lg font-bold text-black ${loading ? 'bg-[#52525B]' : 'bg-[#0D9488] hover:bg-[#0f766e]'} transition-colors`}
          >
            {loading ? "Memverifikasi & Menyuntikkan ke Database..." : "💾 Simpan ke Otak AI"}
          </button>

          {/* PESAN SUKSES/GAGAL */}
          {message && (
            <div className={`p-4 rounded-lg mt-2 font-bold ${message.includes('✅') ? 'bg-[#14532d] text-[#4ade80]' : 'bg-[#7f1d1d] text-[#f87171]'}`}>
              {message}
            </div>
          )}

        </form>
      </div>
    </div>
  );
}