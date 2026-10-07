import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { sentPushes } from "../lib/push.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const tokenSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["android", "ios", "web"]).optional(),
});

// Testler icin: gonderilen bildirimleri goster (sadece NODE_ENV=test).
if (env.nodeEnv === "test") {
  router.get("/__test/pushes", (_req, res) => res.json({ items: sentPushes }));
}

router.use(requireAuth);

// Ayni cihazda farkli hesaba gecilirse token yeni kullaniciya tasinir.
router.post("/", async (req, res) => {
  const input = tokenSchema.parse(req.body);

  await prisma.deviceToken.upsert({
    where: { token: input.token },
    create: { token: input.token, userId: req.user.id, platform: input.platform ?? null },
    update: { userId: req.user.id, platform: input.platform ?? null },
  });

  return res.status(204).send();
});

// Cikis yaparken cagrilir; bu cihaza artik bildirim gitmez.
router.post("/unregister", async (req, res) => {
  const input = tokenSchema.parse(req.body);

  await prisma.deviceToken.deleteMany({
    where: { token: input.token, userId: req.user.id },
  });

  return res.status(204).send();
});

export default router;
