import { randomBytes } from "node:crypto";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";
import { publicUserSelect } from "./users.js";

export const membershipInclude = {
  couple: {
    include: {
      memberships: {
        orderBy: {
          joinedAt: "asc",
        },
        include: {
          user: {
            select: publicUserSelect,
          },
        },
      },
    },
  },
};

export function generateInviteCode() {
  return randomBytes(6).toString("hex").toUpperCase();
}

export async function loadMembershipForUser(userId) {
  return prisma.coupleMembership.findUnique({
    where: { userId },
    include: membershipInclude,
  });
}

export async function requireMembership(userId) {
  const membership = await loadMembershipForUser(userId);

  if (!membership) {
    throw new AppError(409, "Henuz bir partnerle eslesmedin.");
  }

  return membership;
}

// Sadece coupleId gereken rotalar icin hafif sorgu (uye listesi ve kullanicilari cekmez).
export async function requireCoupleId(userId) {
  const membership = await prisma.coupleMembership.findUnique({
    where: { userId },
    select: { coupleId: true },
  });

  if (!membership) {
    throw new AppError(409, "Henuz bir partnerle eslesmedin.");
  }

  return membership.coupleId;
}

export function getPartnerMember(membership) {
  return membership.couple.memberships.find((item) => item.userId !== membership.userId) ?? null;
}
