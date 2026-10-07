import { io } from "socket.io-client";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";
const API = `${BASE}/api`;
let failures = 0;

function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

async function call(path, { method = "GET", token, body, raw, contentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (raw) headers["Content-Type"] = contentType;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ["websocket"], auth: { token }, forceNew: true });
    const events = [];
    socket.onAny((event, payload) => events.push({ event, payload }));
    socket.on("connect", () => resolve({ socket, events }));
    socket.on("connect_error", reject);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (client, event) => client.events.some((e) => e.event === event);

console.log("Kayit / giris");
let r = await call("/auth/register", { method: "POST", body: { username: "Zeyno", email: "z@test.com", password: "password1", displayName: "Zeynep" } });
check("zeyno kayit 201", r.status === 201, JSON.stringify(r.json));
const zeyno = r.json;
check("username kucuk harfe cevrildi", zeyno.user.username === "zeyno");
r = await call("/auth/register", { method: "POST", body: { username: "hakan", email: "h@test.com", password: "password2", displayName: "Hakan" } });
check("hakan kayit 201", r.status === 201);
const hakan = r.json;
r = await call("/auth/register", { method: "POST", body: { username: "zeyno", email: "x@test.com", password: "password3", displayName: "XX" } });
check("ayni username 409", r.status === 409, r.json?.message);
r = await call("/auth/register", { method: "POST", body: { username: "a b", email: "y@test.com", password: "password3", displayName: "Y" } });
check("gecersiz username 400", r.status === 400, r.json?.message);
r = await call("/auth/username-available?username=hakan");
check("username-available false", r.json?.available === false);
r = await call("/auth/login", { method: "POST", body: { identifier: "@Hakan", password: "password2" } });
check("username ile giris", r.status === 200 && r.json.token);
r = await call("/auth/login", { method: "POST", body: { email: "z@test.com", password: "password1" } });
check("eski istemci email ile giris", r.status === 200);
r = await call("/auth/login", { method: "POST", body: { identifier: "zeyno", password: "wrong" } });
check("yanlis sifre 401", r.status === 401);

console.log("Soket (eslesmemis kullanici da baglanabilmeli)");
const zs = await connect(zeyno.token);
const hs = await connect(hakan.token);
check("iki soket baglandi", zs.socket.connected && hs.socket.connected);

console.log("Arama ve eslesme istegi");
r = await call("/users/search?q=hak", { token: zeyno.token });
check("arama hakan'i bulur", r.json.items.length === 1 && r.json.items[0].username === "hakan");
check("aramada e-posta yok", r.json.items[0].email === undefined);
r = await call("/partner-requests", { method: "POST", token: zeyno.token, body: { username: "zeyno" } });
check("kendine istek 400", r.status === 400);
r = await call("/partner-requests", { method: "POST", token: zeyno.token, body: { username: "yokboyle" } });
check("olmayan kullanici 404", r.status === 404);
r = await call("/partner-requests", { method: "POST", token: zeyno.token, body: { username: "hakan" } });
check("istek gonderildi 201", r.status === 201);
const requestId = r.json.request.id;
await wait(200);
check("hakan soketten istegi aldi", has(hs, "partner-request:new"));
r = await call("/partner-requests", { token: hakan.token });
check("hakan gelen istekleri gorur", r.json.incoming.length === 1 && r.json.incoming[0].fromUser.username === "zeyno");

r = await call(`/partner-requests/${requestId}/accept`, { method: "POST", token: zeyno.token });
check("gonderen kabul edemez", r.status === 404);
r = await call(`/partner-requests/${requestId}/accept`, { method: "POST", token: hakan.token });
check("hakan kabul etti", r.status === 200 && r.json.couple?.partner?.user?.username === "zeyno");
await wait(300);
check("zeyno couple:updated aldi", has(zs, "couple:updated"));
check("presence:update geldi", has(zs, "presence:update"));

console.log("Canli mesajlasma (yeniden baglanmadan)");
r = await call("/messages", { method: "POST", token: zeyno.token, body: { type: "TEXT", text: "Merhaba", clientMessageId: "c1" } });
check("mesaj gonderildi", r.status === 201);
check("partner online oldugu icin iletildi", r.json.message.deliveredAt !== null);
await wait(200);
check("hakan message:new aldi", has(hs, "message:new"));
r = await call("/messages", { method: "POST", token: zeyno.token, body: { type: "TEXT", text: "Merhaba", clientMessageId: "c1" } });
check("ayni clientMessageId tekrar etmez", r.json.deduplicated === true);
hs.socket.emit("typing:update", { isTyping: true });
await wait(200);
check("zeyno typing:update aldi", has(zs, "typing:update"));
r = await call("/messages/read-all", { method: "POST", token: hakan.token, body: {} });
check("okundu", r.json.updatedCount === 1);

console.log("Ortak veri");
r = await call("/data/collections/bucketList", { method: "POST", token: hakan.token, body: { data: { title: "Paris" } } });
check("koleksiyona eklendi", r.status === 201);
await wait(200);
check("zeyno data:collection-upsert aldi", has(zs, "data:collection-upsert"));
r = await call(`/data/collections/bucketList/${r.json.item.id}`, { method: "DELETE", token: zeyno.token });
check("silindi", r.status === 204);
r = await call(`/data/collections/bucketList/yok`, { method: "DELETE", token: zeyno.token });
check("olmayan kaydi silmek hata vermez", r.status === 204);

console.log("Cift ayarlari");
r = await call("/couples/me", { method: "PATCH", token: zeyno.token, body: { startDate: "2022-08-15T14:00:00.000Z" } });
check("baslangic tarihi kaydedildi", r.json.couple?.startDate === "2022-08-15T14:00:00.000Z");

console.log("Medya");
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
r = await call("/media", { method: "POST", token: zeyno.token, raw: png, contentType: "image/png" });
check("yukleme 201", r.status === 201, JSON.stringify(r.json));
const mediaUrl = r.json.url;
const mediaRes = await fetch(mediaUrl);
const bytes = Buffer.from(await mediaRes.arrayBuffer());
check("dosya geri okunur", mediaRes.status === 200 && bytes.equals(png));
check("content-type dogru", mediaRes.headers.get("content-type") === "image/png");
r = await call("/media", { method: "POST", token: zeyno.token, raw: Buffer.from("x"), contentType: "application/x-msdownload" });
check("desteklenmeyen tip 415", r.status === 415);
r = await call("/messages", { method: "POST", token: zeyno.token, body: { type: "IMAGE", mediaUrl, mediaMimeType: "image/png" } });
check("resimli mesaj", r.status === 201);

console.log("Ortak galeri ve surpriz");
const bigPhoto = Buffer.alloc(2 * 1024 * 1024, 7);
r = await call("/media", { method: "POST", token: hakan.token, raw: bigPhoto, contentType: "image/jpeg" });
check("2 MB fotograf yuklenir", r.status === 201);
const photoUrl = r.json.url;
r = await call("/data/collections/photos", {
  method: "POST",
  token: hakan.token,
  body: { data: { url: photoUrl, caption: "Ilk tatilimiz", addedBy: hakan.user.id, isSurprise: true, unlockAt: "2020-01-01T00:00:00.000Z" } },
});
check("surpriz ani olusturuldu", r.status === 201);
const surpriseId = r.json.item.id;
await wait(200);
const zeynoSaw = zs.events.find((e) => e.event === "data:collection-upsert" && e.payload.item?.id === surpriseId);
check("zeyno surprizi canli gordu", zeynoSaw?.payload.item.data.isSurprise === true);
hs.events.length = 0;
r = await call(`/data/collections/photos/${surpriseId}`, {
  method: "PATCH",
  token: zeyno.token,
  body: { data: { revealedAt: new Date().toISOString(), revealedBy: zeyno.user.id } },
});
check("zeyno surprizi acti", r.status === 200 && r.json.item.data.caption === "Ilk tatilimiz");
await wait(200);
const opened = hs.events.find((e) => e.event === "data:collection-upsert" && e.payload.item?.id === surpriseId);
check("hakan acildigini canli ogrendi", opened?.payload.item.data.revealedBy === zeyno.user.id);
r = await call("/data/collections/photos", { token: zeyno.token });
check("galeri iki tarafta ayni", r.json.items.length === 1);
const tooBig = await call("/media", { method: "POST", token: hakan.token, raw: Buffer.alloc(9 * 1024 * 1024), contentType: "image/jpeg" });
check("8 MB ustu reddedilir", tooBig.status === 413);

console.log("Profil");
r = await call("/auth/me", { method: "PATCH", token: hakan.token, body: { displayName: "Hakan A." } });
check("isim guncellendi", r.json.user.displayName === "Hakan A.");
r = await call("/auth/change-password", { method: "POST", token: hakan.token, body: { currentPassword: "password2", newPassword: "newpassword" } });
check("sifre degisti", r.status === 200);
r = await call("/auth/login", { method: "POST", body: { identifier: "hakan", password: "newpassword" } });
check("yeni sifre ile giris", r.status === 200);

console.log("Ayrilma");
r = await call("/couples/leave", { method: "POST", token: hakan.token });
check("hakan ayrildi", r.status === 200 && r.json.couple === null);
r = await call("/auth/me", { token: zeyno.token });
check("zeyno partnersiz kaldi ama oda duruyor", r.json.couple && r.json.couple.partner === null);
r = await call("/partner-requests", { method: "POST", token: hakan.token, body: { username: "zeyno" } });
check("eslesmis kullaniciya istek 409", r.status === 409);
r = await call("/couples/leave", { method: "POST", token: zeyno.token });
check("zeyno da ayrildi", r.status === 200);
r = await call("/partner-requests", { method: "POST", token: hakan.token, body: { username: "zeyno" } });
check("tekrar istek", r.status === 201);
r = await call("/partner-requests", { method: "POST", token: zeyno.token, body: { username: "hakan" } });
check("karsilikli istek otomatik eslestirir", r.json.matched === true);

console.log("Saglik");
r = await call("/messages", { token: "bozuk" });
check("bozuk token 401", r.status === 401);
const bad = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bozuk" });
check("bozuk JSON 400", bad.status === 400);

zs.socket.close();
hs.socket.close();
await wait(300);
r = await fetch(`${API}/health`);
check("sunucu ayakta", r.status === 200);

console.log("Push bildirimleri");
r = await call("/devices", { method: "POST", token: hakan.token, body: { token: "hakan-device-token-123", platform: "android" } });
check("hakan cihazi kaydedildi", r.status === 204);
r = await call("/devices", { method: "POST", token: zeyno.token, body: { token: "zeyno-device-token-456", platform: "android" } });
check("zeyno cihazi kaydedildi", r.status === 204);
r = await call("/messages", { method: "POST", token: zeyno.token, body: { type: "TEXT", text: "Uyudun mu?" } });
await wait(200);
let pushes = (await call("/devices/__test/pushes")).json.items;
check("cevrimdisi hakana mesaj push'u gitti", pushes.some((p) => p.userId === hakan.user.id && p.body === "Uyudun mu?" && p.type === "message"));
await call("/data/documents/last_hug", { method: "PATCH", token: hakan.token, body: { data: { senderId: hakan.user.id } } });
await wait(200);
pushes = (await call("/devices/__test/pushes")).json.items;
check("sarilma push'u zeynoya gitti", pushes.some((p) => p.userId === zeyno.user.id && p.body.includes("sarıldı")));
const online = await connect(hakan.token);
await wait(200);
const before = pushes.length;
await call("/messages", { method: "POST", token: zeyno.token, body: { type: "TEXT", text: "Buradasin" } });
await wait(200);
pushes = (await call("/devices/__test/pushes")).json.items;
check("hakan cevrimiciyken push gitmez", !pushes.slice(before).some((p) => p.userId === hakan.user.id));
online.socket.close();
r = await call("/devices/unregister", { method: "POST", token: hakan.token, body: { token: "hakan-device-token-123" } });
check("cikista cihaz silindi", r.status === 204);
await wait(300);
const beforeLogout = pushes.length;
await call("/messages", { method: "POST", token: zeyno.token, body: { type: "TEXT", text: "Yok musun" } });
await wait(200);
pushes = (await call("/devices/__test/pushes")).json.items;
check("cihazi silinene push gitmez", !pushes.slice(beforeLogout).some((p) => p.userId === hakan.user.id));

console.log(failures === 0 ? "\nTUM TESTLER GECTI" : `\n${failures} TEST BASARISIZ`);
process.exit(failures === 0 ? 0 : 1);
