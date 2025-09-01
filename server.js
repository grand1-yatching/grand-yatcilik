import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Busboy from 'busboy';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config(); // .env dosyasını yükle

// __dirname muadili (ESM'de yoktur, biz türetiyoruz)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// public/index.html ve statik dosyaları servis et
app.use(express.static(path.join(__dirname, 'public')));

// FormData (multipart/form-data) parse
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const busboy = Busboy({ headers: req.headers });
    busboy.on('field', (name, val) => { fields[name] = val; });
    busboy.on('error', reject);
    busboy.on('finish', () => resolve(fields));
    req.pipe(busboy);
  });
}

// Basit escape
function esc(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

// API: form gönderimi → WhatsApp mesajı
app.post('/api/reserve', async (req, res) => {
  try {
    const data = await parseFormData(req);

    // Honeypot (bot filtresi)
    if (data.website) return res.status(200).json({ ok: true });

    // Zorunlu alanlar
    const required = ['full_name','phone','tour','date'];
    for (const k of required) {
      if (!data[k] || !String(data[k]).trim()) {
        return res.status(400).json({ error: `Eksik alan: ${k}` });
      }
    }

    const fullName = esc(data.full_name);
    const phone    = esc(data.phone);
    const tour     = esc(data.tour); // “Tekne X • … — ₺…” formatı
    const date     = esc(data.date);
    const submittedAt = esc(data.submitted_at || new Date().toISOString());
    const page        = esc(data.page_url || '');

    const body =
`📩 *Yeni Rezervasyon Talebi*
👤 Ad Soyad: ${fullName}
📞 Telefon: ${phone}
🛥️ Tur: ${tour}
📅 Tarih: ${date}

⏱️ Gönderim: ${submittedAt}
🔗 Sayfa: ${page}`;

    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await client.messages.create({
      from: process.env.TWILIO_FROM,   // örn: 'whatsapp:+14155238886'
      to: process.env.OWNER_PHONE,     // örn: 'whatsapp:+90XXXXXXXXXX'
      body
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`✅ Server çalışıyor: http://localhost:${PORT}`);
});
