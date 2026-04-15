import prismaPackage from "@prisma/client";

const { PrismaClient } = prismaPackage;

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__sanalKavanozPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__sanalKavanozPrisma = prisma;
}
