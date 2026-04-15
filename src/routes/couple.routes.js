import { Router } from "express";
import { z } from "zod";
import { generateInviteCode, loadMembershipForUser } from "../lib/couple.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { serializeCouple } from "../lib/serializers.js";
import { presenceStore } from "../socket/presence-store.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(2).max(80).optional().nullable(),
});

const joinSchema = z.object({
  inviteCode: z.string().trim().min(6).max(32),
});

router.use(requireAuth);

router.get("/me", async (req, res) => {
  const membership = await loadMembershipForUser(req.user.id);

  return res.json({
    couple: serializeCouple(membership, presenceStore),
  });
});

router.post("/create", async (req, res) => {
  const input = createSchema.parse(req.body);
  const existingMembership = await loadMembershipForUser(req.user.id);

  if (existingMembership) {
    throw new AppError(409, "Bu kullanici zaten bir cift odasina bagli.");
  }

  let inviteCode = generateInviteCode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const conflict = await prisma.couple.findUnique({
      where: {
        inviteCode,
      },
      select: {
        id: true,
      },
    });

    if (!conflict) {
      break;
    }

    inviteCode = generateInviteCode();
  }

  await prisma.couple.create({
    data: {
      name: input.name ?? null,
      inviteCode,
      memberships: {
        create: {
          userId: req.user.id,
        },
      },
    },
  });

  const membership = await loadMembershipForUser(req.user.id);

  return res.status(201).json({
    couple: serializeCouple(membership, presenceStore),
  });
});

router.post("/join", async (req, res) => {
  const input = joinSchema.parse(req.body);
  const existingMembership = await loadMembershipForUser(req.user.id);

  if (existingMembership) {
    throw new AppError(409, "Bu kullanici zaten bir cift odasina bagli.");
  }

  const couple = await prisma.couple.findUnique({
    where: {
      inviteCode: input.inviteCode.toUpperCase(),
    },
    include: {
      memberships: true,
    },
  });

  if (!couple) {
    throw new AppError(404, "Davet kodu bulunamadi.");
  }

  if (couple.memberships.length >= 2) {
    throw new AppError(409, "Bu cift odasi zaten dolu.");
  }

  await prisma.coupleMembership.create({
    data: {
      coupleId: couple.id,
      userId: req.user.id,
    },
  });

  const membership = await loadMembershipForUser(req.user.id);

  return res.json({
    couple: serializeCouple(membership, presenceStore),
  });
});

export default router;

