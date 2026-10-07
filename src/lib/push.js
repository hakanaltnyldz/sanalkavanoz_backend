import { cert, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { presenceStore } from "../socket/presence-store.js";

// Uygulama acikken bildirimler soketten gelir; push sadece partner
// cevrimdisiyken (uygulama kapali/arka planda) gonderilir.

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

// Testlerde gercek Firebase yerine gonderilen bildirimler burada birikir.
export const sentPushes = [];

let messaging = null;
let initialized = false;

function loadServiceAccount() {
  if (env.firebaseServiceAccount) {
    const raw = env.firebaseServiceAccount.trim();
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json);
  }
  return null;
}

function getMessagingClient() {
  if (initialized) {
    return messaging;
  }
  initialized = true;

  if (env.nodeEnv === "test") {
    return null;
  }

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.warn("FIREBASE_SERVICE_ACCOUNT tanimli degil; push bildirimleri kapali.");
      return null;
    }
    messaging = getMessaging(initializeApp({ credential: cert(serviceAccount) }));
  } catch (error) {
    console.error("Firebase baslatilamadi; push bildirimleri kapali:", error.message);
    messaging = null;
  }

  return messaging;
}

function truncate(text, max = 140) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Kullanicinin tum cihazlarina bildirim gonderir.
 * Hata firlatmaz; bildirim gitmemesi asil islemi bozmamali.
 */
export async function sendPushToUser(userId, { title, body, type, channelId = "message_notification" }) {
  try {
    if (!userId || presenceStore.isOnline(userId)) {
      return;
    }

    const devices = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (devices.length === 0) {
      return;
    }

    const message = {
      tokens: devices.map((device) => device.token),
      notification: { title: truncate(title, 80), body: truncate(body) },
      data: { type: String(type ?? "") },
      android: {
        priority: "high",
        notification: { channelId, sound: "default", color: "#E91E63" },
      },
      apns: { payload: { aps: { sound: "default" } } },
    };

    if (env.nodeEnv === "test") {
      sentPushes.push({ userId, title: message.notification.title, body: message.notification.body, type });
      return;
    }

    const client = getMessagingClient();
    if (!client) {
      return;
    }

    const result = await client.sendEachForMulticast(message);
    const invalid = result.responses
      .map((response, index) => (!response.success && INVALID_TOKEN_CODES.has(response.error?.code) ? message.tokens[index] : null))
      .filter(Boolean);

    if (invalid.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: invalid } } });
    }
  } catch (error) {
    console.error("Push gonderilemedi:", error.message);
  }
}

export async function findPartnerUserId(coupleId, userId) {
  const partner = await prisma.coupleMembership.findFirst({
    where: { coupleId, userId: { not: userId } },
    select: { userId: true },
  });
  return partner?.userId ?? null;
}

/** Partnere, cevrimdisiysa, bildirim gonderir. Cagiran beklemek zorunda degil. */
export function notifyPartner(coupleId, actorUserId, payload) {
  findPartnerUserId(coupleId, actorUserId)
    .then((partnerId) => sendPushToUser(partnerId, payload))
    .catch((error) => console.error("Partner bildirimi hatasi:", error.message));
}
