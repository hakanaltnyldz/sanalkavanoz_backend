import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import authRoutes from "./routes/auth.routes.js";
import coupleRoutes from "./routes/couple.routes.js";
import dataRoutes from "./routes/data.routes.js";
import healthRoutes from "./routes/health.routes.js";
import messageRoutes from "./routes/message.routes.js";
import presenceRoutes from "./routes/presence.routes.js";

export function createApp() {
  const app = express();

  if (env.nodeEnv === "production") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/", (_req, res) => {
    res.json({
      service: "sanal-kavanoz-backend",
      docs: "/api/health",
    });
  });

  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/couples", coupleRoutes);
  app.use("/api/data", dataRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/presence", presenceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
