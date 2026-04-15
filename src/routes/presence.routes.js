import { Router } from "express";
import { z } from "zod";
import { requireMembership } from "../lib/couple.js";
import { prisma } from "../lib/prisma.js";
import { emitPresenceUpdate } from "../socket/socket.js";
import { presenceStore } from "../socket/presence-store.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const heartbeatSchema = z.object({
  isTyping: z.boolean().optional(),
});

router.use(requireAuth);

router.get("/current", async (req, res) => {
  const membership = await requireMembership(req.user.id);

  return res.json({
    coupleId: membership.coupleId,
    typingUserIds: presenceStore.getTypingUserIds(membership.coupleId),
    users: membership.couple.memberships.map((member) => ({
      id: member.user.id,
      email: member.user.email,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl ?? null,
      lastSeenAt: member.user.lastSeenAt ? member.user.lastSeenAt.toISOString() : null,
      isOnline: presenceStore.isOnline(member.user.id),
      isTyping: presenceStore.isTyping(member.user.id),
    })),
    serverTime: new Date().toISOString(),
  });
});

router.post("/heartbeat", async (req, res) => {
  const input = heartbeatSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");
  const now = new Date();

  await prisma.user.update({
    where: {
      id: req.user.id,
    },
    data: {
      lastSeenAt: now,
    },
  });

  if (typeof input.isTyping === "boolean") {
    presenceStore.setTyping(req.user.id, membership.coupleId, input.isTyping);
  }

  await emitPresenceUpdate(io, membership.coupleId);

  return res.json({
    ok: true,
    timestamp: now.toISOString(),
  });
});

export default router;

