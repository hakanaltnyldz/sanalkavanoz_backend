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
    return res.status(400).json({
      error: "ValidationError",
      message: "Gonderilen veri gecersiz.",
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

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return res.status(409).json({
      error: "ConflictError",
      message: "Ayni anahtar ile kayit zaten mevcut.",
    });
  }

  console.error(error);

  return res.status(500).json({
    error: "InternalServerError",
    message: "Sunucu tarafinda beklenmeyen bir hata olustu.",
  });
}
