import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./scripts/firebase-service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

// İlk iki kullanıcının Firebase UID'leri
const USER1_UID = 'G0t2wZXclPN4E9rHksnqaEcpbsE3'; // hakanaltunyaldiz1248@gmail.com
const USER2_UID = 'PVBCLHvvGxgWaicFKmRXq0kXZUu1'; // zeyno@sanalkavanoz.app

// Firestore'daki couple'ı bul
console.log('Couples kontrol ediliyor...');
const couplesSnap = await db.collection('couples').get();
couplesSnap.forEach(doc => {
  const d = doc.data();
  console.log(`Couple ID: ${doc.id}`, JSON.stringify(d, null, 2));
});

// Notes koleksiyonunu bul - farklı yollar dene
console.log('\nNotes koleksiyonu aranıyor...');

// Doğrudan notes koleksiyonu
const notesSnap = await db.collection('notes').get();
console.log(`/notes koleksiyonu: ${notesSnap.size} belge`);
if (notesSnap.size > 0) {
  const first = notesSnap.docs[0];
  console.log('İlk mesaj örneği:', JSON.stringify(first.data(), null, 2));
}

// couples/{coupleId}/notes alt koleksiyonu
if (couplesSnap.size > 0) {
  for (const coupleDoc of couplesSnap.docs) {
    const subNotes = await db.collection('couples').doc(coupleDoc.id).collection('notes').get();
    console.log(`couples/${coupleDoc.id}/notes: ${subNotes.size} belge`);
    if (subNotes.size > 0) {
      console.log('İlk mesaj örneği:', JSON.stringify(subNotes.docs[0].data(), null, 2));
    }
  }
}
