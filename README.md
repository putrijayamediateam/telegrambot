# Bot Stok Klinik Putrijaya: versi pelayan (sentiasa hidup)

Logik bot sama dengan Code.gs (Apps Script) tetapi berjalan sebagai pelayan Node.js.
Google Sheet kekal sebagai pangkalan data. Bacaan dari memori (laju), tulisan ke Sheet di belakang tabir.

## Perbezaan daripada versi Apps Script
- Balasan bot kira-kira 0.5 hingga 1.5 saat (bukan 3 hingga 8 saat).
- Gambar invois TIDAK lagi disimpan dalam Drive. Telegram menyimpannya; Sheet menyimpan pautan
  `PUBLIC_URL/f/<id>?s=<tandatangan>` yang hanya sah dengan tandatangan. Pelayan mesti hidup untuk buka gambar.
- Sheet dimuat semula setiap 2 minit apabila tiada tulisan tertangguh, jadi suntingan manual dalam Sheet
  (Akaun, Ubat, Jadual, Stok) dikenali dalam masa 2 minit. Jangan sisip atau padam baris dalam tab Rekod, Baris,
  Stok, Pergerakan, Gambar kerana tulisan bot berdasarkan nombor baris. Tambah di hujung sahaja.
- Kaunter ID (GRN, ST, RC, ADJ, KH) disimpan dalam tab `Sistem` (dicipta automatik).
- Sesi wizard disimpan dalam memori. Jika pelayan dimulakan semula, sesi yang belum siap hilang (staf tekan /menu semula).

## Tetapan (Environment Variables)
Lihat `.env.example`.

## Google service account (sekali sahaja)
1. console.cloud.google.com, cipta projek.
2. APIs & Services, Library, aktifkan **Google Sheets API**.
3. IAM & Admin, Service Accounts, Create. Pilih akaun itu, Keys, Add key, JSON. Fail dimuat turun.
4. Buka Sheet bot, Share, tambah emel service account (`...@...iam.gserviceaccount.com`) sebagai **Editor**.
5. Kandungan fail JSON dimasukkan sebagai `GOOGLE_SERVICE_ACCOUNT_JSON` (jangan kongsi dalam chat).

## Jalankan
```
docker build -t bot-stok .
docker run -p 8080:8080 --env-file .env bot-stok
```
Atau tanpa Docker: `node server.js` (Node 20 ke atas).

## Pasang webhook Telegram
Selepas pelayan hidup, buka dalam browser sekali:
`PUBLIC_URL/setup?k=SECRET`
Ini mendaftar webhook ke `PUBLIC_URL/hook` dan menetapkan senarai arahan bot.
Untuk kembali ke Apps Script: jalankan `setupWebhook` di editor Apps Script (ia mendaftar semula URL lama).

## Pemeriksaan
- `PUBLIC_URL/health` menunjukkan `tulisan_menunggu` (patut 0 atau kecil) dan `gagal` (patut 0).
- Log pelayan menunjukkan ralat tulisan Sheet. Ralat dalam Sheet tab `Log` juga dicatat.

## Ujian
`npm test` menjalankan semua senario bot (sama dengan versi Apps Script) dan ujian hujung ke hujung dengan API palsu.
