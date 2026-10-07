import { Router } from "express";
import { requireMembership } from "../lib/couple.js";
import { serializeUser } from "../lib/serializers.js";
import { presenceStore } from "../socket/presence-store.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

router.use(requireAuth);

// Canli durum soket uzerinden akar; bu uc sadece ilk acilista anlik durumu verir.
router.get("/current", async (req, res) => {
  const membership = await requireMembership(req.user.id);

  return res.json({
    coupleId: membership.coupleId,
    typingUserIds: presenceStore.getTypingUserIds(membership.coupleId),
    users: membership.couple.memberships.map((member) => serializeUser(member.user, presenceStore)),
    serverTime: new Date().toISOString(),
  });
});

export default router;
