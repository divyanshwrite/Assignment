import cors from "cors";
import type { CorsOptions } from "cors";
import express from "express";
import http from "http";
import mongoose from "mongoose";
import morgan from "morgan";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { createRedisClient, EVENT_CHANNEL } from "./db/redis.js";
import assignmentsRouter from "./routes/assignments.js";
import shareRouter from "./routes/share.js";
import type { AssignmentEvent } from "./types/assessment.js";

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || env.CLIENT_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true
};

const app = express();
app.set("trust proxy", 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.CLIENT_ORIGINS,
    methods: ["GET", "POST"]
  }
});

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vedaai-backend" });
});

app.get("/ready", (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  res.status(mongoReady ? 200 : 503).json({
    ok: mongoReady,
    mongo: mongoReady ? "connected" : "disconnected"
  });
});

app.use("/api/assignments", assignmentsRouter);
app.use("/api/share", shareRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Validation failed.", issues: error.flatten().fieldErrors });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({
      message: env.NODE_ENV === "production" ? "Internal server error." : error.message
    });
    return;
  }

  res.status(500).json({ message: "Unexpected server error." });
});

io.on("connection", (socket) => {
  socket.on("assignment:watch", (assignmentId: string) => {
    socket.join(assignmentId);
  });
});

await connectMongo();

const subscriber = createRedisClient();
await subscriber.subscribe(EVENT_CHANNEL);
subscriber.on("message", (_channel: string, raw: string) => {
  try {
    const event = JSON.parse(raw) as AssignmentEvent;
    io.to(event.assignmentId).emit("assignment:update", event);
  } catch (error) {
    console.error("Could not forward assignment event", error);
  }
});

server.listen(env.PORT, () => {
  console.log(`VedaAI API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down API server...`);
  server.close(async () => {
    await subscriber.quit();
    await disconnectMongo();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
