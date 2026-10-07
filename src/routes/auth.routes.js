import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { hashPassword, signAccessToken, verifyPassword } from "../lib/auth.js";
import { loadMembershipForUser } from "../lib/couple.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { serializeCouple, serializeUser } from "../lib/serializers.js";
import { assertValidUsername, normalizeUsername, publicUserSelect } from "../lib/users.js";
import { presenceStore } from "../socket/presence-store.js";
import { emitPresenceUpdate } from "../socket/socket.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TooManyRequests",
    message: "Cok fazla deneme yapildi. Biraz sonra tekrar dene.",
  },
});

const passwordSchema = z.string().trim().min(8, "Sifre en az 8 karakter olmali.").max(72);

const registerSchema = z.object({
  username: z.string(),
  email: z.string().trim().email("Gecerli bir e-posta gir."),
  password: passwordSchema,
  displayName: z.string().trim().min(2, "Isim en az 2 karakter olmali.").max(40),
});

// "identifier" e-posta ya da kullanici adi olabilir; eski istemciler "email" gonderir.
const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    password: z.string().trim().min(1).max(72),
  })
  .refine((value) => value.identifier || value.email, {
    message: "E-posta veya kullanici adi gerekli.",
    path: ["identifier"],
  });

const updateMeSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  username: z.string().optional(),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().trim().min(1).max(72),
  newPassword: passwordSchema,
});

async function isUsernameTaken(username, exceptUserId = null) {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  return Boolean(existing && existing.id !== exceptUserId);
}

async function buildSessionPayload(user, token = null) {
  const membership = await loadMembershipForUser(user.id);

  return {
    ...(token ? { token } : {}),
    user: serializeUser(user, presenceStore),
    couple: serializeCouple(membership, presenceStore),
  };
}

router.get("/username-available", async (req, res) => {
  const username = normalizeUsername(req.query.username);
  assertValidUsername(username);

  return res.json({
    username,
    available: !(await isUsernameTaken(username)),
  });
});

router.post("/register", authLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const username = normalizeUsername(input.username);
  assertValidUsername(username);

  const [emailOwner, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    isUsernameTaken(username),
  ]);

  if (emailOwner) {
    throw new AppError(409, "Bu e-posta ile zaten bir hesap var.");
  }

  if (usernameTaken) {
    throw new AppError(409, "Bu kullanici adi alinmis.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      lastSeenAt: new Date(),
    },
    select: publicUserSelect,
  });

  return res.status(201).json({
    token: signAccessToken(user),
    user: serializeUser(user, presenceStore),
    couple: null,
  });
});

router.post("/login", authLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  // "@hakan" gibi bastaki @ kullanici adina aittir; e-posta ortada @ icerir.
  const identifier = (input.identifier ?? input.email).trim().toLowerCase().replace(/^@+/, "");
  const where = identifier.includes("@")
    ? { email: identifier }
    : { username: normalizeUsername(identifier) };

  const user = await prisma.user.findUnique({
    where,
    select: {
      ...publicUserSelect,
      passwordHash: true,
    },
  });

  // Kullanici yoksa da ayni mesaj: hangi hesaplarin var oldugu sizmasin.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, "Kullanici adi/e-posta veya sifre hatali.");
  }

  const { passwordHash: _ignored, ...safeUser } = user;
  const token = signAccessToken(safeUser);

  return res.json(await buildSessionPayload(safeUser, token));
});

router.get("/me", requireAuth, async (req, res) => {
  return res.json(await buildSessionPayload(req.user));
});

router.patch("/me", requireAuth, async (req, res) => {
  const input = updateMeSchema.parse(req.body);
  const data = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }

  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl;
  }

  if (input.username !== undefined) {
    const username = normalizeUsername(input.username);
    assertValidUsername(username);

    if (await isUsernameTaken(username, req.user.id)) {
      throw new AppError(409, "Bu kullanici adi alinmis.");
    }

    data.username = username;
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: publicUserSelect,
  });

  const payload = await buildSessionPayload(user);

  if (payload.couple) {
    await emitPresenceUpdate(req.app.get("io"), payload.couple.id);
  }

  return res.json(payload);
});

router.post("/change-password", requireAuth, authLimiter, async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { passwordHash: true },
  });

  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, "Mevcut sifre hatali.");
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  return res.json({ ok: true });
});

export default router;
