import { Router } from "express";
import { z } from "zod";
import { generateInviteCode, loadMembershipForUser } from "../lib/couple.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { serializeCouple, serializePartnerRequest } from "../lib/serializers.js";
import { normalizeUsername } from "../lib/users.js";
import { presenceStore } from "../socket/presence-store.js";
import { attachUserToCouple, emitPresenceUpdate, emitToUser } from "../socket/socket.js";
import { requireAuth } from "../middleware/require-auth.js";
import { pushForPartnerAccepted, pushForPartnerRequest } from "../lib/push-events.js";

const router = Router();

const requestUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
};

const requestInclude = {
  fromUser: { select: requestUserSelect },
  toUser: { select: requestUserSelect },
};

const createSchema = z.object({
  username: z.string().min(1),
});

router.use(requireAuth);

async function assertNotPaired(userId, message) {
  const membership = await prisma.coupleMembership.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (membership) {
    throw new AppError(409, message);
  }
}

async function findRequestOrThrow(requestId) {
  const request = await prisma.partnerRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  });

  if (!request) {
    throw new AppError(404, "Istek bulunamadi.");
  }

  return request;
}

function notifyRequestChange(io, request) {
  const payload = { request: serializePartnerRequest(request) };
  emitToUser(io, request.fromUserId, "partner-request:updated", payload);
  emitToUser(io, request.toUserId, "partner-request:updated", payload);
}

// Iki kullaniciyi tek transaction icinde eslestirir, ikisinin diger bekleyen isteklerini iptal eder.
async function acceptRequest(io, requestId, actingUserId) {
  const coupleId = await prisma.$transaction(async (tx) => {
    const request = await tx.partnerRequest.findUnique({ where: { id: requestId } });

    if (!request || request.toUserId !== actingUserId) {
      throw new AppError(404, "Istek bulunamadi.");
    }

    if (request.status !== "PENDING") {
      throw new AppError(409, "Bu istek artik gecerli degil.");
    }

    const userIds = [request.fromUserId, request.toUserId];
    const existing = await tx.coupleMembership.count({
      where: { userId: { in: userIds } },
    });

    if (existing > 0) {
      throw new AppError(409, "Taraflardan biri zaten baska biriyle eslesmis.");
    }

    const couple = await tx.couple.create({
      data: {
        inviteCode: generateInviteCode(),
        memberships: {
          create: [{ userId: request.fromUserId }, { userId: request.toUserId }],
        },
      },
      select: { id: true },
    });

    const now = new Date();
    await tx.partnerRequest.update({
      where: { id: request.id },
      data: { status: "ACCEPTED", respondedAt: now },
    });
    await tx.partnerRequest.updateMany({
      where: {
        status: "PENDING",
        id: { not: request.id },
        OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }],
      },
      data: { status: "CANCELLED", respondedAt: now },
    });

    return couple.id;
  });

  const request = await findRequestOrThrow(requestId);

  await attachUserToCouple(io, request.fromUserId, coupleId);
  await attachUserToCouple(io, request.toUserId, coupleId);

  notifyRequestChange(io, request);
  emitToUser(io, request.fromUserId, "couple:updated", { coupleId });
  if (request.toUser) {
    pushForPartnerAccepted(request.fromUserId, request.toUser);
  }
  emitToUser(io, request.toUserId, "couple:updated", { coupleId });
  await emitPresenceUpdate(io, coupleId);

  return loadMembershipForUser(actingUserId);
}

router.get("/", async (req, res) => {
  const [incoming, outgoing] = await Promise.all([
    prisma.partnerRequest.findMany({
      where: { toUserId: req.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: requestInclude,
    }),
    prisma.partnerRequest.findMany({
      where: { fromUserId: req.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: requestInclude,
    }),
  ]);

  return res.json({
    incoming: incoming.map(serializePartnerRequest),
    outgoing: outgoing.map(serializePartnerRequest),
  });
});

router.post("/", async (req, res) => {
  const { username: rawUsername } = createSchema.parse(req.body);
  const username = normalizeUsername(rawUsername);
  const io = req.app.get("io");

  if (username === req.user.username) {
    throw new AppError(400, "Kendine istek gonderemezsin.");
  }

  await assertNotPaired(req.user.id, "Zaten bir partnerle eslesmissin.");

  const target = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!target) {
    throw new AppError(404, `@${username} adinda bir kullanici bulunamadi.`);
  }

  await assertNotPaired(target.id, "Bu kullanici zaten baska biriyle eslesmis.");

  // Karsi taraf bana zaten istek attiysa beklemeden eslestir.
  const reverse = await prisma.partnerRequest.findFirst({
    where: { fromUserId: target.id, toUserId: req.user.id, status: "PENDING" },
    select: { id: true },
  });

  if (reverse) {
    const membership = await acceptRequest(io, reverse.id, req.user.id);
    return res.json({
      matched: true,
      request: null,
      couple: serializeCouple(membership, presenceStore),
    });
  }

  const existing = await prisma.partnerRequest.findFirst({
    where: { fromUserId: req.user.id, toUserId: target.id, status: "PENDING" },
    include: requestInclude,
  });

  if (existing) {
    return res.json({ matched: false, request: serializePartnerRequest(existing), couple: null });
  }

  const request = await prisma.partnerRequest.create({
    data: { fromUserId: req.user.id, toUserId: target.id },
    include: requestInclude,
  });

  emitToUser(io, target.id, "partner-request:new", {
    request: serializePartnerRequest(request),
  });
  pushForPartnerRequest(target.id, req.user);

  return res.status(201).json({
    matched: false,
    request: serializePartnerRequest(request),
    couple: null,
  });
});

router.post("/:requestId/accept", async (req, res) => {
  const membership = await acceptRequest(req.app.get("io"), String(req.params.requestId), req.user.id);

  return res.json({
    matched: true,
    couple: serializeCouple(membership, presenceStore),
  });
});

router.post("/:requestId/decline", async (req, res) => {
  const request = await findRequestOrThrow(String(req.params.requestId));

  if (request.toUserId !== req.user.id) {
    throw new AppError(404, "Istek bulunamadi.");
  }

  if (request.status !== "PENDING") {
    throw new AppError(409, "Bu istek artik gecerli degil.");
  }

  const updated = await prisma.partnerRequest.update({
    where: { id: request.id },
    data: { status: "DECLINED", respondedAt: new Date() },
    include: requestInclude,
  });

  notifyRequestChange(req.app.get("io"), updated);
  return res.json({ request: serializePartnerRequest(updated) });
});

router.delete("/:requestId", async (req, res) => {
  const request = await findRequestOrThrow(String(req.params.requestId));

  if (request.fromUserId !== req.user.id) {
    throw new AppError(404, "Istek bulunamadi.");
  }

  if (request.status !== "PENDING") {
    throw new AppError(409, "Bu istek artik gecerli degil.");
  }

  const updated = await prisma.partnerRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", respondedAt: new Date() },
    include: requestInclude,
  });

  notifyRequestChange(req.app.get("io"), updated);
  return res.status(204).send();
});

export default router;
