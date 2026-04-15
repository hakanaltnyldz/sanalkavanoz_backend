class PresenceStore {
  constructor() {
    this.userSockets = new Map();
    this.userCouples = new Map();
    this.typingUntil = new Map();
  }

  connect(userId, socketId, coupleId) {
    const sockets = this.userSockets.get(userId) ?? new Set();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
    this.userCouples.set(userId, coupleId);
  }

  disconnect(userId, socketId) {
    const sockets = this.userSockets.get(userId);

    if (!sockets) {
      return;
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      this.userCouples.delete(userId);
      this.typingUntil.delete(userId);
      return;
    }

    this.userSockets.set(userId, sockets);
  }

  isOnline(userId) {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  setTyping(userId, coupleId, isTyping) {
    if (isTyping) {
      this.userCouples.set(userId, coupleId);
      this.typingUntil.set(userId, Date.now() + 5000);
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
}

export const presenceStore = new PresenceStore();
