import type { AssignmentEvent } from "../types/assessment.js";
import { createRedisClient, EVENT_CHANNEL } from "../db/redis.js";

const publisher = createRedisClient();

export async function publishAssignmentEvent(event: AssignmentEvent) {
  await publisher.publish(EVENT_CHANNEL, JSON.stringify(event));
}
