import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import authRoutes from "./routes/auth.routes.js";
import coupleRoutes from "./routes/couple.routes.js";
import dataRoutes from "./routes/data.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import healthRoutes from "./routes/health.routes.js";
import mediaRoutes from "./routes/media.routes.js";
import messageRoutes from "./routes/message.routes.js";
import partnerRoutes from "./routes/partner.routes.js";
import presenceRoutes from "./routes/presence.routes.js";
import userRoutes from "./routes/user.routes.js";

export function createApp() {
  const app = express();

  if (env.nodeEnv === "production") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  // Medya dosyalari web istemcisinden de yuklenebilsin diye cross-origin izni.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(morgan(env.nodeEnv === "production" ? "tiny" : "dev"));

  app.get("/", (_req, res) => {
    res.json({
      service: "sanal-kavanoz-backend",
      docs: "/api/health",
    });
  });

  // Medya rotasi kendi raw body parser'ini kullanir; JSON parser'dan once baglanmali.
  app.use("/api/media", mediaRoutes);

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/partner-requests", partnerRoutes);
  app.use("/api/couples", coupleRoutes);
  app.use("/api/data", dataRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/presence", presenceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
