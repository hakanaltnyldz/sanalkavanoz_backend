import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";

function extractBearerToken(req) {
  const authorization = req.headers.authorization ?? "";

  if (!authorization.startsWith("Bearer ")) {
    throw new AppError(401, "Gecerli bir Bearer token gerekli.");
  }

  return authorization.slice(7).trim();
}

export async function requireAuth(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: {
        id: String(payload.sub),
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

    if (!user) {
      throw new AppError(401, "Token gecersiz ya da kullanici silinmis.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

