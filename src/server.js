import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { registerSocketHandlers } from "./socket/socket.js";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL tanimli degil.");
}

if (env.nodeEnv === "production" && env.jwtSecret === "dev-only-secret-change-me") {
  throw new Error("Production modunda JWT_SECRET zorunlu.");
}

const app = createApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: env.corsOrigins,
    credentials: true,
  },
  // Mobil aglarda kopmalari daha hizli fark et.
  pingInterval: 20_000,
  pingTimeout: 20_000,
  // Kisa kopmalarda (tunel, asansor) odalari ve kacirilan olaylari geri getir.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});

app.set("io", io);
registerSocketHandlers(io);

httpServer.listen(env.port, () => {
  console.log(`Sanal Kavanoz backend ayakta: http://localhost:${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} alindi, backend kapatiliyor...`);

  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

// Beklenmeyen bir hata sureci dusurmesin; logla ve calismaya devam et.
process.on("unhandledRejection", (reason) => {
  console.error("Yakalanmamis promise hatasi:", reason);
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

