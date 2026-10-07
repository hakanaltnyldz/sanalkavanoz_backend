import prismaPackage from "@prisma/client";
import { ZodError } from "zod";

const { Prisma } = prismaPackage;

export class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, "Istenen endpoint bulunamadi."));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];

    return res.status(400).json({
      error: "ValidationError",
      message: firstIssue?.message && !firstIssue.message.startsWith("Invalid")
        ? firstIssue.message
        : "Gonderilen veri gecersiz.",
      details: error.flatten(),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.name,
      message: error.message,
      details: error.details,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "ConflictError",
        message: "Ayni anahtar ile kayit zaten mevcut.",
      });
    }

    if (error.code === "P2025") {
      return res.status(404).json({
        error: "NotFoundError",
        message: "Kayit bulunamadi.",
      });
    }
  }

  // express.json / express.raw hatalari (bozuk JSON, cok buyuk dosya).
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "ValidationError",
      message: "Gonderilen JSON okunamadi.",
    });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "PayloadTooLarge",
      message: "Dosya cok buyuk.",
    });
  }

  console.error(error);

  return res.status(500).json({
    error: "InternalServerError",
    message: "Sunucu tarafinda beklenmeyen bir hata olustu.",
  });
}
