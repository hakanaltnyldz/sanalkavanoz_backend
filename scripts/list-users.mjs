import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./scripts/firebase-service-account.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const result = await auth.listUsers(100);

console.log('Firebase Kullanıcıları:');
result.users.forEach(u => {
  console.log(`  UID: ${u.uid}`);
  console.log(`  Email: ${u.email}`);
  console.log(`  DisplayName: ${u.displayName}`);
  console.log('---');
});
