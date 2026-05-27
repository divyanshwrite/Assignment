import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectMongo() {
  mongoose.set("strictQuery", true);
  if (env.MONGODB_URI.startsWith("mongodb+srv://") && env.MONGODB_DNS_SERVERS.length > 0) {
    dns.setServers(env.MONGODB_DNS_SERVERS);
  }
  await mongoose.connect(env.MONGODB_URI);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
