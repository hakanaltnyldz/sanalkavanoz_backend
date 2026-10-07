import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";
import { publicUserSelect } from "../lib/users.js";

function extractBearerToken(req) {
  const authorization = req.headers.authorization ?? "";

  if (!authorization.startsWith("Bearer ")) {
    throw new AppError(401, "Oturum bulunamadi, lutfen tekrar giris yap.");
  }

  return authorization.slice(7).trim();
}

export async function requireAuth(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    let payload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(401, "Oturumun suresi doldu, lutfen tekrar giris yap.");
    }

    const user = await prisma.user.findUnique({
      where: {
        id: String(payload.sub),
      },
      select: publicUserSelect,
    });

    if (!user) {
      throw new AppError(401, "Hesap bulunamadi, lutfen tekrar giris yap.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
