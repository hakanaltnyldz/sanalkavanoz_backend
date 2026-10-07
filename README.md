# Sanal Kavanoz Backend

Sanal Kavanoz uygulamasının tek veri kaynağı: hesaplar, partner eşleşmesi, mesajlaşma, ortak veriler ve medya.
Firebase kullanılmıyor.

**Teknoloji:** Node.js 22, Express 5, Socket.IO, Prisma, PostgreSQL (Neon), Render.

## Akış

1. Kullanıcı **kullanıcı adı + e-posta + şifre** ile kayıt olur. Giriş e-posta ya da kullanıcı adıyla yapılır.
2. Partnerini kullanıcı adıyla arar ve **eşleşme isteği** gönderir.
3. Karşı taraf kabul edince (ya da ikisi birbirine istek atınca) çift odası oluşur. İki tarafın soketi de anında odaya alınır, yeniden giriş gerekmez.
4. Mesajlar, anılar, listeler ve "yazıyor / çevrimiçi" durumu Socket.IO üzerinden canlı akar.

Eski hesaplarda kullanıcı adı boş olabilir; uygulama ilk girişte kullanıcı adı seçtirir.

## REST API

| Uç | Açıklama |
| --- | --- |
| `POST /api/auth/register` | `{ username, email, password, displayName }` |
| `POST /api/auth/login` | `{ identifier, password }`. `identifier` e-posta ya da kullanıcı adı |
| `GET /api/auth/me` | Oturum + çift bilgisi |
| `PATCH /api/auth/me` | `{ displayName?, username?, avatarUrl? }` |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }` |
| `GET /api/auth/username-available?username=` | Kullanıcı adı müsait mi |
| `GET /api/users/search?q=` | Kullanıcı adına göre arama (e-posta dönmez) |
| `GET /api/partner-requests` | `{ incoming, outgoing }` bekleyen istekler |
| `POST /api/partner-requests` | `{ username }`. Karşılıklı istekte anında eşleşir |
| `POST /api/partner-requests/:id/accept` · `/decline` | İsteği yanıtla |
| `DELETE /api/partner-requests/:id` | Gönderilen isteği geri al |
| `GET /api/couples/me` · `PATCH /api/couples/me` | Çift bilgisi, `{ startDate?, name? }` |
| `POST /api/couples/leave` | Eşleşmeyi bitir; odada kimse kalmazsa ortak veri silinir |
| `GET/POST /api/messages`, `POST /api/messages/read-all`, `DELETE /api/messages/:id` | Mesajlaşma |
| `/api/data/collections/:name[/:id]`, `/api/data/documents/:key` | Ortak koleksiyon / belge |
| `POST /api/media` | Ham dosya gövdesi + `Content-Type` (görsel/ses, en fazla 8 MB). `{ url }` döner |
| `GET /api/media/:id` | Dosyayı döndürür (id 128 bit rastgele) |
| `GET /api/presence/current` | İlk açılış için anlık çevrimiçi durumu |

## Socket olayları

Bağlantı: `auth: { token }`. Eşleşmemiş kullanıcılar da bağlanır.

- **İstemci → sunucu:** `presence:heartbeat`, `typing:update { isTyping }`
- **Sunucu → istemci:** `message:new`, `message:deleted`, `messages:delivered`, `messages:read`,
  `presence:update`, `typing:update`, `data:collection-upsert|delete`, `data:document-update|delete`,
  `partner-request:new`, `partner-request:updated`, `couple:updated`

## Kurulum

```powershell
Copy-Item .env.example .env   # DATABASE_URL ve JWT_SECRET'i doldur
npm.cmd install
npm.cmd run prisma:generate
npm.cmd run prisma:push
npm.cmd run dev
```

## Test

Gerçek veritabanı gerekmez; bellek içi PGlite ile uçtan uca test çalışır:

```powershell
npm.cmd test
```

## Push bildirimleri

Uygulama kapalıyken mesaj, sarılma, "seni düşünüyorum", eşleşme isteği, yeni anı ve sürpriz bildirimleri
Firebase Cloud Messaging ile gönderilir. Firebase sadece bildirim taşır; hesaplar ve veriler bu sunucudadır.

- Uygulama giriş yapınca cihazını `POST /api/devices { token, platform }` ile kaydeder, çıkışta `POST /api/devices/unregister` ile siler.
- Partner o an çevrimiçiyse (soket açıksa) push gönderilmez; bildirim soketten gelir.
- Sunucu tarafında `FIREBASE_SERVICE_ACCOUNT` ortam değişkenine Firebase servis hesabı JSON'u (tek satır ya da base64) verilmelidir. Boşsa push kapalıdır, geri kalan her şey çalışır.

## Deploy (Render)

`render.yaml` hazır. Başlangıçta `prisma db push` çalışır. Yeni alanlar (kullanıcı adı, eşleşme istekleri, medya)
mevcut veriyi silmeden eklenir. Render ortamında `DATABASE_URL` ve `JWT_SECRET` tanımlı olmalı.
