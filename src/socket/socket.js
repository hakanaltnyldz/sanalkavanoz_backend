import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";
import { loadMembershipForUser } from "../lib/couple.js";
import { markMessagesDelivered } from "../lib/messages.js";
import { serializeMessage, serializeUser } from "../lib/serializers.js";
import { presenceStore } from "./presence-store.js";

const socketUserSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
};

function roomName(coupleId) {
  return `couple:${coupleId}`;
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

async function buildPresencePayload(coupleId) {
  const couple = await prisma.couple.findUnique({
    where: {
      id: coupleId,
    },
    include: {
      memberships: {
        orderBy: {
          joinedAt: "asc",
        },
        include: {
          user: {
            select: socketUserSelect,
          },
        },
      },
    },
  });

  return {
    coupleId,
    typingUserIds: presenceStore.getTypingUserIds(coupleId),
    users: (couple?.memberships ?? []).map((membership) => serializeUser(membership.user, presenceStore)),
    emittedAt: new Date().toISOString(),
  };
}

export async function emitPresenceUpdate(io, coupleId) {
  io.to(roomName(coupleId)).emit("presence:update", await buildPresencePayload(coupleId));
}

export function emitDeliveryUpdate(io, coupleId, receipts) {
  if (!io || receipts.length === 0) {
    return;
  }

  io.to(roomName(coupleId)).emit("messages:delivered", {
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

  io.to(roomName(coupleId)).emit("messages:read", {
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

  io.to(roomName(coupleId)).emit("message:new", {
    coupleId,
    message: serializeMessage(message),
    emittedAt: new Date().toISOString(),
  });
}

export function emitDeletedMessage(io, coupleId, messageId, deletedAt) {
  if (!io) {
    return;
  }

  io.to(roomName(coupleId)).emit("message:deleted", {
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

  io.to(roomName(coupleId)).emit("data:collection-upsert", {
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

  io.to(roomName(coupleId)).emit("data:collection-delete", {
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

  io.to(roomName(coupleId)).emit("data:document-update", {
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

  io.to(roomName(coupleId)).emit("data:document-delete", {
    coupleId,
    documentKey,
    emittedAt: new Date().toISOString(),
  });
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
        select: socketUserSelect,
      });

      if (!user) {
        return next(new Error("UNAUTHORIZED"));
      }

      const membership = await loadMembershipForUser(user.id);

      if (!membership) {
        return next(new Error("NO_COUPLE"));
      }

      socket.data.userId = user.id;
      socket.data.coupleId = membership.coupleId;
      next();
    } catch (_error) {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId;
    const coupleId = socket.data.coupleId;
    const now = new Date();

    socket.join(roomName(coupleId));
    presenceStore.connect(userId, socket.id, coupleId);

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        lastSeenAt: now,
      },
    });

    const deliveries = await markMessagesDelivered(coupleId, userId);
    emitDeliveryUpdate(io, coupleId, deliveries);
    await emitPresenceUpdate(io, coupleId);

    socket.on("presence:heartbeat", async () => {
      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          lastSeenAt: new Date(),
        },
      });

      await emitPresenceUpdate(io, coupleId);
    });

    socket.on("typing:update", async (payload = {}) => {
      presenceStore.setTyping(userId, coupleId, Boolean(payload.isTyping));

      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          lastSeenAt: new Date(),
        },
      });

      await emitPresenceUpdate(io, coupleId);
    });

    socket.on("disconnect", async () => {
      presenceStore.disconnect(userId, socket.id);

      await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          lastSeenAt: new Date(),
        },
      });

      await emitPresenceUpdate(io, coupleId);
    });
  });
}
