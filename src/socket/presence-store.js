const TYPING_TTL_MS = 5000;
const LAST_SEEN_PERSIST_INTERVAL_MS = 60_000;

class PresenceStore {
  constructor() {
    this.userSockets = new Map();
    this.userCouples = new Map();
    this.typingUntil = new Map();
    this.lastSeenPersistedAt = new Map();
  }

  connect(userId, socketId, coupleId) {
    const sockets = this.userSockets.get(userId) ?? new Set();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
    this.setCouple(userId, coupleId);
  }

  // Kullanicinin son soketi kapandiysa true doner.
  disconnect(userId, socketId) {
    const sockets = this.userSockets.get(userId);

    if (!sockets) {
      return true;
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      this.userCouples.delete(userId);
      this.typingUntil.delete(userId);
      this.lastSeenPersistedAt.delete(userId);
      return true;
    }

    return false;
  }

  setCouple(userId, coupleId) {
    if (coupleId) {
      this.userCouples.set(userId, coupleId);
    } else {
      this.userCouples.delete(userId);
      this.typingUntil.delete(userId);
    }
  }

  isOnline(userId) {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  isAnyOtherMemberOnline(coupleId, userId) {
    for (const [memberId, memberCoupleId] of this.userCouples.entries()) {
      if (memberCoupleId === coupleId && memberId !== userId && this.isOnline(memberId)) {
        return true;
      }
    }

    return false;
  }

  setTyping(userId, isTyping) {
    if (isTyping) {
      this.typingUntil.set(userId, Date.now() + TYPING_TTL_MS);
      return;
    }

    this.typingUntil.delete(userId);
  }

  pruneTyping() {
    const now = Date.now();

    for (const [userId, expiresAt] of this.typingUntil.entries()) {
      if (expiresAt <= now) {
        this.typingUntil.delete(userId);
      }
    }
  }

  isTyping(userId) {
    this.pruneTyping();
    return this.typingUntil.has(userId);
  }

  getTypingUserIds(coupleId) {
    this.pruneTyping();

    return Array.from(this.typingUntil.keys()).filter((userId) => this.userCouples.get(userId) === coupleId);
  }

  // lastSeenAt her heartbeat'te DB'ye yazilmasin; dakikada en fazla bir kez.
  shouldPersistLastSeen(userId, force = false) {
    const now = Date.now();
    const last = this.lastSeenPersistedAt.get(userId) ?? 0;

    if (!force && now - last < LAST_SEEN_PERSIST_INTERVAL_MS) {
      return false;
    }

    this.lastSeenPersistedAt.set(userId, now);
    return true;
  }
}

export const presenceStore = new PresenceStore();
