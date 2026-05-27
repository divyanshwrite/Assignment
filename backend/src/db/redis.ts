import { Redis, type RedisOptions } from "ioredis";
import { env } from "../config/env.js";

export const EVENT_CHANNEL = "vedaai.assignment.events";

export function createRedisClient(options?: RedisOptions) {
  if (options) {
    return new Redis(env.REDIS_URL, options);
  }
  return new Redis(env.REDIS_URL);
}

export function createQueueConnection() {
  return createRedisClient({ maxRetriesPerRequest: null });
}
