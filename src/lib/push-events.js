import { notifyPartner, sendPushToUser } from "./push.js";

// Hangi olayda partnere hangi bildirimin gidecegi burada toplanir.

export function pushForNewMessage(coupleId, sender, message) {
  if (!message || message.type === "SYSTEM") {
    return;
  }

  const body =
    message.type === "IMAGE"
      ? "📷 Fotoğraf gönderdi"
      : message.type === "VOICE"
        ? "🎤 Sesli mesaj gönderdi"
        : message.text ?? "";

  notifyPartner(coupleId, sender.id, {
    title: sender.displayName,
    body,
    type: "message",
  });
}

export function pushForCollectionWrite(coupleId, actor, collectionName, item, { isNew, patch }) {
  if (collectionName !== "photos") {
    return;
  }

  const data = item?.data ?? {};

  if (isNew) {
    if (data.isSurprise) {
      const unlockAt = data.unlockAt ? new Date(data.unlockAt) : null;
      const later = unlockAt && unlockAt > new Date();
      notifyPartner(coupleId, actor.id, {
        title: `🎁 ${actor.displayName} sana bir sürpriz bıraktı`,
        body: later
          ? `${unlockAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} tarihinde açabileceksin 💫`
          : "Galeride seni paketli bir anı bekliyor. Hemen açabilirsin!",
        type: "gallery",
        channelId: "memory_notification",
      });
      return;
    }

    notifyPartner(coupleId, actor.id, {
      title: `📸 ${actor.displayName} yeni bir anı ekledi`,
      body: data.caption || "Galeriye bakmaya ne dersin?",
      type: "gallery",
      channelId: "memory_notification",
    });
    return;
  }

  if (patch?.revealedAt && patch?.revealedBy === actor.id && data.addedBy && data.addedBy !== actor.id) {
    sendPushToUser(data.addedBy, {
      title: `💝 ${actor.displayName} sürprizini açtı!`,
      body: "Bıraktığın anıyı şimdi görüyor.",
      type: "gallery",
      channelId: "memory_notification",
    });
  }
}

export function pushForDocumentWrite(coupleId, actor, documentKey) {
  if (documentKey === "last_hug") {
    notifyPartner(coupleId, actor.id, {
      title: actor.displayName,
      body: "🤗 Sana sarıldı!",
      type: "home",
    });
  } else if (documentKey === "last_ping") {
    notifyPartner(coupleId, actor.id, {
      title: actor.displayName,
      body: "💭 Seni düşünüyor...",
      type: "home",
    });
  }
}

export function pushForPartnerRequest(targetUserId, fromUser) {
  sendPushToUser(targetUserId, {
    title: "💌 Yeni eşleşme isteği",
    body: `${fromUser.displayName} (@${fromUser.username}) seninle eşleşmek istiyor`,
    type: "partner",
  });
}

export function pushForPartnerAccepted(requesterUserId, accepter) {
  sendPushToUser(requesterUserId, {
    title: "💞 Eşleştiniz!",
    body: `${accepter.displayName} isteğini kabul etti. Kavanozunuz artık ortak.`,
    type: "partner",
  });
}
