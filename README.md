# Sanal Kavanoz Backend

Bu servis, Flutter uygulamasindaki en kritik eksigi kapatmak icin yazildi:

- gercek auth
- cift odasi mantigi
- tek bir mesajlasma kaynagi
- delivered/read receipt
- typing + last seen + online presence
- bucket list, galeri, takvim, story, mektup, playlist, yerler ve diger ortak moduller icin generic couple-data katmani
- Socket.IO ile gercek zamanli event akisi

## Cozulen Ana Sorunlar

- Flutter tarafindaki iki ayri sohbet akisini tek backend sozlesmesine indirir.
- `okundu`, `iletildi`, `son gorulme`, `yaziyor` gibi durumlari veri modeli haline getirir.
- istemciye hardcode kullanici/parola gommeden iki hesap akisini server tarafina tasir.
- daginik local sync yerine tek mesaj kaynagi saglar.

## Teknoloji Secimi

- Node.js 22
- Express 5
- Socket.IO
- Prisma
- PostgreSQL

Bu kombinasyon Flutter tarafinda kolay kullanilir, Render gibi servislerde tek web service olarak ayaga kalkar ve Neon Postgres ile bedava prototip kurulumuna uygundur.

## Klasor Yapisi

```txt
sanalkavanoz_bakcned/
  prisma/
  src/
  .env.example
  package.json
  render.yaml
```

## Veri Modeli

### User

- `email`
- `passwordHash`
- `displayName`
- `avatarUrl`
- `lastSeenAt`

### Couple

- `name`
- `inviteCode`

### CoupleMembership

- bir kullanici sadece bir cift odasina baglanabilir

### Message

- `type`: `TEXT | IMAGE | VOICE | SYSTEM`
- `text`
- `mediaUrl`
- `mediaMimeType`
- `voiceDurationSeconds`
- `deliveredAt`
- `readAt`
- `replyToMessageId`
- `clientMessageId`

### CoupleCollectionItem

- `collectionName`
- `itemKey`
- `data` (JSON)

### CoupleSharedDocument

- `documentKey`
- `data` (JSON)

## REST API

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Couple

- `GET /api/couples/me`
- `POST /api/couples/create`
- `POST /api/couples/join`

### Messages

- `GET /api/messages?limit=40&before=2026-04-15T12:00:00.000Z`
- `POST /api/messages`
- `POST /api/messages/read-all`
- `POST /api/messages/:messageId/read`

### Presence

- `GET /api/presence/current`
- `POST /api/presence/heartbeat`

### Generic Couple Data

- `GET /api/data/collections/:collectionName`
- `POST /api/data/collections/:collectionName`
- `PUT /api/data/collections/:collectionName/:itemId`
- `PATCH /api/data/collections/:collectionName/:itemId`
- `DELETE /api/data/collections/:collectionName/:itemId`
- `GET /api/data/documents/:documentKey`
- `PUT /api/data/documents/:documentKey`
- `PATCH /api/data/documents/:documentKey`
- `DELETE /api/data/documents/:documentKey`

## Socket Eventleri

### Client -> Server

- `presence:heartbeat`
- `typing:update` payload: `{ "isTyping": true }`

### Server -> Client

- `presence:update`
- `message:new`
- `messages:delivered`
- `messages:read`
- `data:collection-upsert`
- `data:collection-delete`
- `data:document-update`
- `data:document-delete`

## Lokal Kurulum

1. Klasore gir:

```powershell
cd C:\Users\PC\Desktop\zeyno\sanalkavanoz_bakcned
```

2. Ornek env dosyasini kopyala:

```powershell
Copy-Item .env.example .env
```

3. Paketleri kur:

```powershell
npm.cmd install
```

4. Prisma client uret:

```powershell
npm.cmd run prisma:generate
```

5. Veritabani semasini uygula:

```powershell
npm.cmd run prisma:push
```

6. Demo hesaplari istersen `.env` icinde doldur ve calistir:

```powershell
npm.cmd run prisma:seed
```

7. Servisi baslat:

```powershell
npm.cmd run dev
```

## Ornek Auth Akisi

### Kayit

```json
POST /api/auth/register
{
  "email": "hakan@example.com",
  "password": "ChangeMe123!",
  "displayName": "Hakan"
}
```

### Giris

```json
POST /api/auth/login
{
  "email": "hakan@example.com",
  "password": "ChangeMe123!"
}
```

## Ornek Mesaj Gonderimi

```json
POST /api/messages
Authorization: Bearer <token>
{
  "clientMessageId": "flutter-local-1744720000",
  "type": "TEXT",
  "text": "Seni seviyorum"
}
```

## Flutter Tarafi Entegrasyon Sirasi

1. Firebase auth yerine bu backendin `/api/auth/login` ve `/api/auth/register` endpointlerini kullan.
2. `notes` ve `chat` ekranlarini tek `messages` kaynagina dusur.
3. `markAllAsRead()` yerine `/api/messages/read-all` cagir.
4. `typing_status`, `lastSeen`, `online` gibi Firestore anahtarlarini Socket.IO eventlerine tasi.
5. `isRead`, `isDelivered`, `readAt` alanlarini backend cevabindan guncelle.

## Ucretsiz Deploy Onerisi

- Web service: Render
- PostgreSQL: Neon

Render uzerine deploy icin `render.yaml` eklendi. Veritabani olarak Neon URL'sini `DATABASE_URL` degiskenine vermen yeterli.

## Bilincli Olarak Disarida Birakilanlar

- medya dosyasini sunucuya lokal disk ile yukleme
- push notification
- refresh token sistemi
- yonetim paneli

Bunlar ikinci asamada eklenmeli. Ozellikle foto/ses icin object storage veya Cloudinary benzeri bir katman gerekir.
