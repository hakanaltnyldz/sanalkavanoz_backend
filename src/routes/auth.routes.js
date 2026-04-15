import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { hashPassword, signAccessToken, verifyPassword } from "../lib/auth.js";
import { loadMembershipForUser } from "../lib/couple.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { serializeCouple, serializeUser } from "../lib/serializers.js";
import { presenceStore } from "../socket/presence-store.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(8).max(72),
  displayName: z.string().trim().min(2).max(40),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(1).max(72),
});

router.post("/register", authLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        displayName: input.displayName,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const token = signAccessToken(user);

    return res.status(201).json({
      token,
      user: serializeUser(user, presenceStore),
      couple: null,
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(409, "Bu e-posta zaten kayitli.");
    }

    throw error;
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const email = input.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new AppError(401, "E-posta veya sifre hatali.");
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);

  if (!isValid) {
    throw new AppError(401, "E-posta veya sifre hatali.");
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
  });

  const membership = await loadMembershipForUser(user.id);
  const token = signAccessToken(user);

  return res.json({
    token,
    user: serializeUser(user, presenceStore),
    couple: serializeCouple(membership, presenceStore),
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const membership = await loadMembershipForUser(req.user.id);

  return res.json({
    user: serializeUser(req.user, presenceStore),
    couple: serializeCouple(membership, presenceStore),
  });
});

export default router;

