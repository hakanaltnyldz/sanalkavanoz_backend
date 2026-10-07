import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";

const messageInclude = {
  sender: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  replyToMessage: {
    select: {
      id: true,
      type: true,
      text: true,
      mediaUrl: true,
      createdAt: true,
    },
  },
};

export { messageInclude };

export async function markMessagesDelivered(coupleId, receiverUserId) {
  const pending = await prisma.message.findMany({
    where: {
      coupleId,
      deletedAt: null,
      senderId: {
        not: receiverUserId,
      },
      deliveredAt: null,
    },
    select: {
      id: true,
    },
  });

  if (pending.length === 0) {
    return [];
  }

  const deliveredAt = new Date();
  const ids = pending.map((item) => item.id);

  await prisma.message.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      deliveredAt,
    },
  });

  return ids.map((id) => ({
    id,
    deliveredAt,
  }));
}

export async function markMessagesRead({ coupleId, userId, upToMessageId = null }) {
  let upToCreatedAt = null;

  if (upToMessageId) {
    const boundaryMessage = await prisma.message.findFirst({
      where: {
        id: upToMessageId,
        coupleId,
      },
      select: {
        createdAt: true,
      },
    });

    if (!boundaryMessage) {
      throw new AppError(404, "Okunacak mesaj bulunamadi.");
    }

    upToCreatedAt = boundaryMessage.createdAt;
  }

  const pending = await prisma.message.findMany({
    where: {
      coupleId,
      deletedAt: null,
      senderId: {
        not: userId,
      },
      readAt: null,
      ...(upToCreatedAt
        ? {
            createdAt: {
              lte: upToCreatedAt,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });

  if (pending.length === 0) {
    return [];
  }

  const readAt = new Date();
  const ids = pending.map((item) => item.id);

  await prisma.message.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      deliveredAt: readAt,
      readAt,
    },
  });

  return ids.map((id) => ({
    id,
    deliveredAt: readAt,
    readAt,
  }));
}

export async function createMessageForCouple({ coupleId, senderId, input, markDelivered = false }) {
  if (input.clientMessageId) {
    const existing = await prisma.message.findUnique({
      where: {
        clientMessageId: input.clientMessageId,
      },
      include: messageInclude,
    });

    if (existing) {
      return {
        createdNew: false,
        message: existing,
      };
    }
  }

  if (input.replyToMessageId) {
    const replyTarget = await prisma.message.findFirst({
      where: {
        id: input.replyToMessageId,
        coupleId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!replyTarget) {
      throw new AppError(404, "Yanıtlanacak mesaj bulunamadi.");
    }
  }

  const deliveredAt = markDelivered ? new Date() : null;
  const message = await prisma.message.create({
    data: {
      coupleId,
      senderId,
      clientMessageId: input.clientMessageId ?? null,
      type: input.type,
      text: input.text ?? null,
      mediaUrl: input.mediaUrl ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
      voiceDurationSeconds: input.voiceDurationSeconds ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      deliveredAt,
    },
    include: messageInclude,
  });

  return {
    createdNew: true,
    message,
  };
}

export async function deleteMessageForCouple({ coupleId, userId, messageId }) {
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      coupleId,
      deletedAt: null,
    },
    select: {
      id: true,
      senderId: true,
    },
  });

  if (!message) {
    throw new AppError(404, "Silinecek mesaj bulunamadi.");
  }

  if (message.senderId !== userId) {
    throw new AppError(403, "Sadece kendi mesajini silebilirsin.");
  }

  const deletedAt = new Date();
  await prisma.message.update({
    where: {
      id: messageId,
    },
    data: {
      deletedAt,
    },
  });

  return {
    id: messageId,
    deletedAt,
  };
}
