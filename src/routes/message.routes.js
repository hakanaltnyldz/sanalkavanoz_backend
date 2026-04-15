import { Router } from "express";
import { z } from "zod";
import {
  createMessageForCouple,
  deleteMessageForCouple,
  markMessagesDelivered,
  markMessagesRead,
  messageInclude,
} from "../lib/messages.js";
import { getPartnerMember, requireMembership } from "../lib/couple.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { serializeMessage } from "../lib/serializers.js";
import {
  emitDeletedMessage,
  emitDeliveryUpdate,
  emitNewMessage,
  emitReadUpdate,
} from "../socket/socket.js";
import { presenceStore } from "../socket/presence-store.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const listSchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createMessageSchema = z
  .object({
    clientMessageId: z.string().trim().min(1).max(100).optional(),
    type: z.enum(["TEXT", "IMAGE", "VOICE", "SYSTEM"]).default("TEXT"),
    text: z.string().trim().max(4000).optional().nullable(),
    mediaUrl: z.string().trim().url().optional().nullable(),
    mediaMimeType: z.string().trim().max(255).optional().nullable(),
    voiceDurationSeconds: z.number().int().min(0).max(3600).optional().nullable(),
    replyToMessageId: z.string().trim().min(1).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.type === "TEXT" && !value.text) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TEXT tipindeki mesajlarda text zorunlu.",
        path: ["text"],
      });
    }

    if ((value.type === "IMAGE" || value.type === "VOICE") && !value.mediaUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IMAGE ve VOICE tiplerinde mediaUrl zorunlu.",
        path: ["mediaUrl"],
      });
    }
  });

const readManySchema = z.object({
  upToMessageId: z.string().trim().min(1).optional(),
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  const query = listSchema.parse(req.query);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const deliveries = await markMessagesDelivered(membership.coupleId, req.user.id);
  emitDeliveryUpdate(io, membership.coupleId, deliveries);

  const messages = await prisma.message.findMany({
    where: {
      coupleId: membership.coupleId,
      deletedAt: null,
      ...(query.before
        ? {
            createdAt: {
              lt: new Date(query.before),
            },
          }
        : {}),
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    take: query.limit ?? 40,
    include: messageInclude,
  });

  const nextBefore = messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null;

  return res.json({
    items: messages.map(serializeMessage),
    page: {
      nextBefore,
      limit: query.limit ?? 40,
    },
  });
});

router.post("/", async (req, res) => {
  const input = createMessageSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const partner = getPartnerMember(membership);
  const io = req.app.get("io");
  const shouldMarkDelivered = partner ? presenceStore.isOnline(partner.userId) : false;

  const result = await createMessageForCouple({
    coupleId: membership.coupleId,
    senderId: req.user.id,
    input,
    markDelivered: shouldMarkDelivered,
  });

  emitNewMessage(io, membership.coupleId, result.message);

  if (result.message.deliveredAt) {
    emitDeliveryUpdate(io, membership.coupleId, [
      {
        id: result.message.id,
        deliveredAt: result.message.deliveredAt,
      },
    ]);
  }

  return res.status(result.createdNew ? 201 : 200).json({
    message: serializeMessage(result.message),
    deduplicated: !result.createdNew,
  });
});

router.post("/read-all", async (req, res) => {
  const input = readManySchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const receipts = await markMessagesRead({
    coupleId: membership.coupleId,
    userId: req.user.id,
    upToMessageId: input.upToMessageId ?? null,
  });

  emitReadUpdate(io, membership.coupleId, receipts);

  return res.json({
    updatedCount: receipts.length,
    receipts: receipts.map((item) => ({
      messageId: item.id,
      deliveredAt: item.deliveredAt.toISOString(),
      readAt: item.readAt.toISOString(),
    })),
  });
});

router.post("/:messageId/read", async (req, res) => {
  const messageId = String(req.params.messageId ?? "").trim();

  if (!messageId) {
    throw new AppError(400, "messageId zorunlu.");
  }

  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const receipts = await markMessagesRead({
    coupleId: membership.coupleId,
    userId: req.user.id,
    upToMessageId: messageId,
  });

  emitReadUpdate(io, membership.coupleId, receipts);

  return res.json({
    updatedCount: receipts.length,
  });
});

router.delete("/:messageId", async (req, res) => {
  const messageId = String(req.params.messageId ?? "").trim();

  if (!messageId) {
    throw new AppError(400, "messageId zorunlu.");
  }

  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");
  const result = await deleteMessageForCouple({
    coupleId: membership.coupleId,
    userId: req.user.id,
    messageId,
  });

  emitDeletedMessage(io, membership.coupleId, result.id, result.deletedAt);

  return res.status(204).send();
});

export default router;
