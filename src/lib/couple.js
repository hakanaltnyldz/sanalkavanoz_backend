import { randomBytes } from "node:crypto";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
};

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
  return randomBytes(4).toString("hex").toUpperCase();
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
    throw new AppError(409, "Bu kullanici henuz bir cift odasina bagli degil.");
  }

  return membership;
}

export function getPartnerMember(membership) {
  return membership.couple.memberships.find((item) => item.userId !== membership.userId) ?? null;
}

