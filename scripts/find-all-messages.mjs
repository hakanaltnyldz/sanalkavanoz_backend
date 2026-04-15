import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./scripts/firebase-service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

// Tüm root koleksiyonları listele
console.log('=== TÜM ROOT KOLEKSİYONLAR ===');
const collections = await db.listCollections();
for (const col of collections) {
  const snap = await col.get();
  console.log(`/${col.id}: ${snap.size} belge`);
}

// Tüm couple'ların alt koleksiyonlarını tara
console.log('\n=== COUPLE ALT KOLEKSİYONLARI ===');
const couplesSnap = await db.collection('couples').get();
for (const coupleDoc of couplesSnap.docs) {
  const subCols = await coupleDoc.ref.listCollections();
  for (const subCol of subCols) {
    const subSnap = await subCol.get();
    console.log(`couples/${coupleDoc.id}/${subCol.id}: ${subSnap.size} belge`);
  }
}

// Tüm user'ların alt koleksiyonlarını tara
console.log('\n=== USER ALT KOLEKSİYONLARI ===');
const usersSnap = await db.collection('users').get();
for (const userDoc of usersSnap.docs) {
  const subCols = await userDoc.ref.listCollections();
  for (const subCol of subCols) {
    const subSnap = await subCol.get();
    console.log(`users/${userDoc.id}/${subCol.id}: ${subSnap.size} belge`);
  }
}
