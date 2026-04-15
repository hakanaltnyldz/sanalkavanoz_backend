import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./scripts/firebase-service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const BACKEND_URL = 'https://sanalkavanoz-backend.onrender.com/api';

const HAKAN_EMAIL = 'hakan@sanalkavanoz.app';
const ZEYNO_EMAIL = 'zeyno@sanalkavanoz.app';
const HAKAN_PASSWORD = 'Hakan2024!';
const ZEYNO_PASSWORD = 'Zeyno2024!';

async function apiCall(path, method, body, token) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function resetPassword(email, newPassword) {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password: newPassword });
  console.log(`✅ Şifre sıfırlandı: ${email}`);
  return user.uid;
}

async function registerOrLogin(email, password, displayName) {
  // Önce register dene
  try {
    const data = await apiCall('/auth/register', 'POST', { email, password, displayName });
    console.log(`✅ Register: ${email} → backend ID: ${data.user.id}`);
    return data;
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('already') || e.message.includes('exist')) {
      // Zaten kayıtlı, login ol
      const data = await apiCall('/auth/login', 'POST', { email, password });
      console.log(`✅ Login: ${email} → backend ID: ${data.user.id}`);
      return data;
    }
    throw e;
  }
}

// --- ANA AKIŞ ---

console.log('=== 1. Firebase şifreleri sıfırlanıyor ===');
await resetPassword(HAKAN_EMAIL, HAKAN_PASSWORD);
await resetPassword(ZEYNO_EMAIL, ZEYNO_PASSWORD);

console.log('\n=== 2. Backend register/login ===');
const hakanData = await registerOrLogin(HAKAN_EMAIL, HAKAN_PASSWORD, 'Hakan');
const zeynoData = await registerOrLogin(ZEYNO_EMAIL, ZEYNO_PASSWORD, 'Zeyno');

const hakanToken = hakanData.token;
const zeynoToken = zeynoData.token;

console.log('\n=== 3. Couple durumu kontrol ediliyor ===');
const hakanMe = await apiCall('/auth/me', 'GET', null, hakanToken);

let inviteCode;
if (hakanMe.couple) {
  inviteCode = hakanMe.couple.inviteCode;
  console.log(`✅ Hakan zaten bir couple'da: ${hakanMe.couple.id} (invite: ${inviteCode})`);
} else {
  console.log('Couple yok, oluşturuluyor...');
  const coupleData = await apiCall('/couples/create', 'POST', { name: 'Hakan & Zeyno' }, hakanToken);
  inviteCode = coupleData.couple.inviteCode;
  console.log(`✅ Couple oluşturuldu: ${coupleData.couple.id} (invite: ${inviteCode})`);
}

// Zeyno'nun couple durumunu kontrol et
const zeynoMe = await apiCall('/auth/me', 'GET', null, zeynoToken);
if (zeynoMe.couple) {
  console.log(`✅ Zeyno zaten bir couple'da: ${zeynoMe.couple.id}`);
} else {
  console.log(`Zeyno invite code ile katılıyor: ${inviteCode}`);
  const joinData = await apiCall('/couples/join', 'POST', { inviteCode }, zeynoToken);
  console.log(`✅ Zeyno couple'a katıldı: ${joinData.couple.id}`);
}

console.log('\n=== SONUÇ ===');
console.log(`Hakan email    : ${HAKAN_EMAIL}`);
console.log(`Hakan şifre    : ${HAKAN_PASSWORD}`);
console.log(`Hakan backend  : ${hakanData.user.id}`);
console.log(`Zeyno email    : ${ZEYNO_EMAIL}`);
console.log(`Zeyno şifre    : ${ZEYNO_PASSWORD}`);
console.log(`Zeyno backend  : ${zeynoData.user.id}`);
console.log(`Invite code    : ${inviteCode}`);
console.log('\n✅ Kurulum tamamlandı!');
