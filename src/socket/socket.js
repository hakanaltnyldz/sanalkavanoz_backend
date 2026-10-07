import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";
import { markMessagesDelivered } from "../lib/messages.js";
import { serializeMessage, serializeUser } from "../lib/serializers.js";
import { publicUserSelect } from "../lib/users.js";
import { presenceStore } from "./presence-store.js";

export function coupleRoom(coupleId) {
  return `couple:${coupleId}`;
}

export function userRoom(userId) {
  return `user:${userId}`;
}

function extractToken(socket) {
  const authToken = socket.handshake.auth?.token;

  if (authToken) {
    return String(authToken);
  }

  const authorization = socket.handshake.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7).trim();
  }

  return null;
}

// Socket handler'larindaki hatalar yakalanmazsa Node sureci duser; hepsini sar.
function safe(label, handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(`[socket] ${label} hatasi:`, error);
    }
  };
}

async function touchLastSeen(userId, force = false) {
  if (!presenceStore.shouldPersistLastSeen(userId, force)) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  });
}

async function buildPresencePayload(coupleId) {
  const memberships = await prisma.coupleMembership.findMany({
    where: { coupleId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: {
        select: publicUserSelect,
      },
    },
  });

  return {
    coupleId,
    typingUserIds: presenceStore.getTypingUserIds(coupleId),
    users: memberships.map((membership) => serializeUser(membership.user, presenceStore)),
    emittedAt: new Date().toISOString(),
  };
}

export async function emitPresenceUpdate(io, coupleId) {
  if (!io || !coupleId) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("presence:update", await buildPresencePayload(coupleId));
}

export function emitDeliveryUpdate(io, coupleId, receipts) {
  if (!io || receipts.length === 0) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("messages:delivered", {
    coupleId,
    receipts: receipts.map((item) => ({
      messageId: item.id,
      deliveredAt: item.deliveredAt.toISOString(),
    })),
    emittedAt: new Date().toISOString(),
  });
}

export function emitReadUpdate(io, coupleId, receipts) {
  if (!io || receipts.length === 0) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("messages:read", {
    coupleId,
    receipts: receipts.map((item) => ({
      messageId: item.id,
      deliveredAt: item.deliveredAt.toISOString(),
      readAt: item.readAt.toISOString(),
    })),
    emittedAt: new Date().toISOString(),
  });
}

export function emitNewMessage(io, coupleId, message) {
  if (!io) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("message:new", {
    coupleId,
    message: serializeMessage(message),
    emittedAt: new Date().toISOString(),
  });
}

export function emitDeletedMessage(io, coupleId, messageId, deletedAt) {
  if (!io) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("message:deleted", {
    coupleId,
    messageId,
    deletedAt: deletedAt.toISOString(),
    emittedAt: new Date().toISOString(),
  });
}

export function emitCollectionUpsert(io, coupleId, collectionName, item) {
  if (!io) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("data:collection-upsert", {
    coupleId,
    collectionName,
    item,
    emittedAt: new Date().toISOString(),
  });
}

export function emitCollectionDelete(io, coupleId, collectionName, itemId) {
  if (!io) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("data:collection-delete", {
    coupleId,
    collectionName,
    itemId,
    emittedAt: new Date().toISOString(),
  });
}

export function emitDocumentUpdate(io, coupleId, documentKey, document) {
  if (!io) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("data:document-update", {
    coupleId,
    documentKey,
    document,
    emittedAt: new Date().toISOString(),
  });
}

export function emitDocumentDelete(io, coupleId, documentKey) {
  if (!io) {
    return;
  }

  io.to(coupleRoom(coupleId)).emit("data:document-delete", {
    coupleId,
    documentKey,
    emittedAt: new Date().toISOString(),
  });
}

export function emitToUser(io, userId, event, payload = {}) {
  if (!io) {
    return;
  }

  io.to(userRoom(userId)).emit(event, {
    ...payload,
    emittedAt: new Date().toISOString(),
  });
}

// Eslesme olustugunda kullanicinin acik tum soketlerini cift odasina tasir;
// boylece uygulamayi yeniden baslatmadan mesajlasma aninda calisir.
export async function attachUserToCouple(io, userId, coupleId) {
  if (!io) {
    return;
  }

  const sockets = await io.in(userRoom(userId)).fetchSockets();

  for (const socket of sockets) {
    socket.join(coupleRoom(coupleId));
    socket.data.coupleId = coupleId;
  }

  presenceStore.setCouple(userId, coupleId);
}

export async function detachUserFromCouple(io, userId, coupleId) {
  if (!io) {
    return;
  }

  const sockets = await io.in(userRoom(userId)).fetchSockets();

  for (const socket of sockets) {
    socket.leave(coupleRoom(coupleId));
    socket.data.coupleId = null;
  }

  presenceStore.setCouple(userId, null);
}

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);

      if (!token) {
        return next(new Error("UNAUTHORIZED"));
      }

      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: {
          id: String(payload.sub),
        },
        select: {
          id: true,
          membership: {
            select: { coupleId: true },
          },
        },
      });

      if (!user) {
        return next(new Error("UNAUTHORIZED"));
      }

      // Eslesmemis kullanicilar da baglanir: eslesme istekleri bu soketten gelir.
      socket.data.userId = user.id;
      socket.data.coupleId = user.membership?.coupleId ?? null;
      next();
    } catch (_error) {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on(
    "connection",
    safe("connection", async (socket) => {
      const userId = socket.data.userId;

      socket.join(userRoom(userId));
      presenceStore.connect(userId, socket.id, socket.data.coupleId);

      socket.on(
        "presence:heartbeat",
        safe("heartbeat", async () => {
          await touchLastSeen(userId);
        }),
      );

      // Yaziyor bilgisi sadece hafizada tutulur, DB'ye yazilmaz.
      socket.on(
        "typing:update",
        safe("typing", async (payload = {}) => {
          const coupleId = socket.data.coupleId;

          if (!coupleId) {
            return;
          }

          const isTyping = Boolean(payload?.isTyping);
          presenceStore.setTyping(userId, isTyping);
          socket.to(coupleRoom(coupleId)).emit("typing:update", {
            coupleId,
            userId,
            isTyping,
            emittedAt: new Date().toISOString(),
          });
        }),
      );

      socket.on(
        "disconnect",
        safe("disconnect", async () => {
          const coupleId = socket.data.coupleId;
          const wentOffline = presenceStore.disconnect(userId, socket.id);

          if (!wentOffline) {
            return;
          }

          await touchLastSeen(userId, true);
          await emitPresenceUpdate(io, coupleId);
        }),
      );

      if (socket.data.coupleId) {
        const coupleId = socket.data.coupleId;
        socket.join(coupleRoom(coupleId));

        const deliveries = await markMessagesDelivered(coupleId, userId);
        emitDeliveryUpdate(io, coupleId, deliveries);
        await touchLastSeen(userId, true);
        await emitPresenceUpdate(io, coupleId);
        return;
      }

      await touchLastSeen(userId, true);
    }),
  );
}
