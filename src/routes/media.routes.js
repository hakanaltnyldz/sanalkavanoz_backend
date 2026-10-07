import { randomBytes } from "node:crypto";
import express, { Router } from "express";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

const MEDIA_ID_PATTERN = /^[a-f0-9]{32}$/;

function publicBaseUrl(req) {
  return env.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
}

router.post(
  "/",
  requireAuth,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    const mimeType = String(req.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError(415, "Bu dosya turu desteklenmiyor.");
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new AppError(400, "Dosya bos.");
    }

    const membership = await prisma.coupleMembership.findUnique({
      where: { userId: req.user.id },
      select: { coupleId: true },
    });

    const media = await prisma.mediaFile.create({
      data: {
        id: randomBytes(16).toString("hex"),
        coupleId: membership?.coupleId ?? null,
        uploaderId: req.user.id,
        mimeType,
        size: req.body.length,
        data: req.body,
      },
      select: { id: true, mimeType: true, size: true },
    });

    return res.status(201).json({
      id: media.id,
      mimeType: media.mimeType,
      size: media.size,
      url: `${publicBaseUrl(req)}/api/media/${media.id}`,
    });
  },
);

// Id 128 bit rastgele oldugu icin link bilinmeden dosyaya ulasilamaz.
router.get("/:mediaId", async (req, res) => {
  const mediaId = String(req.params.mediaId);

  if (!MEDIA_ID_PATTERN.test(mediaId)) {
    throw new AppError(404, "Dosya bulunamadi.");
  }

  const media = await prisma.mediaFile.findUnique({
    where: { id: mediaId },
    select: { mimeType: true, data: true },
  });

  if (!media) {
    throw new AppError(404, "Dosya bulunamadi.");
  }

  res.set({
    "Content-Type": media.mimeType,
    "Content-Length": String(media.data.length),
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  return res.send(Buffer.from(media.data));
});

router.delete("/:mediaId", requireAuth, async (req, res) => {
  const mediaId = String(req.params.mediaId);
  const media = MEDIA_ID_PATTERN.test(mediaId)
    ? await prisma.mediaFile.findUnique({
        where: { id: mediaId },
        select: { uploaderId: true, coupleId: true },
      })
    : null;

  if (!media) {
    return res.status(204).send();
  }

  const membership = await prisma.coupleMembership.findUnique({
    where: { userId: req.user.id },
    select: { coupleId: true },
  });

  const canDelete =
    media.uploaderId === req.user.id || (media.coupleId && media.coupleId === membership?.coupleId);

  if (!canDelete) {
    throw new AppError(403, "Bu dosyayi silemezsin.");
  }

  await prisma.mediaFile.delete({ where: { id: mediaId } });
  return res.status(204).send();
});

export default router;
