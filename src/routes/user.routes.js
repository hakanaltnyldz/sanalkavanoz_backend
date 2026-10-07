import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePublicUser } from "../lib/serializers.js";
import { normalizeUsername } from "../lib/users.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

router.use(requireAuth);

// Kullanici adina gore arama: tam eslesme en ustte, sonra on ek eslesmeleri.
router.get("/search", async (req, res) => {
  const query = normalizeUsername(req.query.q);

  if (query.length < 2) {
    return res.json({ items: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: req.user.id },
      username: { startsWith: query },
    },
    orderBy: { username: "asc" },
    take: 10,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      membership: { select: { id: true } },
    },
  });

  users.sort((left, right) => Number(right.username === query) - Number(left.username === query));

  return res.json({
    items: users.map((user) => ({
      ...serializePublicUser(user),
      isPaired: Boolean(user.membership),
    })),
  });
});

export default router;
