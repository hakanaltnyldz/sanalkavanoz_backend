import { Router } from "express";
import { z } from "zod";
import { loadMembershipForUser, requireMembership } from "../lib/couple.js";
import { prisma } from "../lib/prisma.js";
import { serializeCouple } from "../lib/serializers.js";
import { presenceStore } from "../socket/presence-store.js";
import { detachUserFromCouple, emitPresenceUpdate, emitToUser } from "../socket/socket.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const updateSchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
});

router.use(requireAuth);

router.get("/me", async (req, res) => {
  const membership = await loadMembershipForUser(req.user.id);

  return res.json({
    couple: serializeCouple(membership, presenceStore),
  });
});

// Iliski baslangic tarihi ve cift adi gibi ortak ayarlar.
router.patch("/me", async (req, res) => {
  const input = updateSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const data = {};

  if (input.name !== undefined) {
    data.name = input.name || null;
  }

  if (input.startDate !== undefined) {
    data.startDate = input.startDate ? new Date(input.startDate) : null;
  }

  await prisma.couple.update({
    where: { id: membership.coupleId },
    data,
  });

  const io = req.app.get("io");
  for (const member of membership.couple.memberships) {
    emitToUser(io, member.userId, "couple:updated", { coupleId: membership.coupleId });
  }

  return res.json({
    couple: serializeCouple(await loadMembershipForUser(req.user.id), presenceStore),
  });
});

// Eslesmeyi bozar. Odada kimse kalmazsa ortak veriler de silinir.
router.post("/leave", async (req, res) => {
  const membership = await requireMembership(req.user.id);
  const coupleId = membership.coupleId;
  const io = req.app.get("io");

  await prisma.$transaction(async (tx) => {
    await tx.coupleMembership.delete({ where: { userId: req.user.id } });
    const remaining = await tx.coupleMembership.count({ where: { coupleId } });

    if (remaining === 0) {
      await tx.couple.delete({ where: { id: coupleId } });
    }
  });

  await detachUserFromCouple(io, req.user.id, coupleId);

  for (const member of membership.couple.memberships) {
    emitToUser(io, member.userId, "couple:updated", { coupleId: null });
  }

  await emitPresenceUpdate(io, coupleId);

  return res.json({ couple: null });
});

export default router;
