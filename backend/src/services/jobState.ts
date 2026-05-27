import type { AssignmentEvent } from "../types/assessment.js";
import { createRedisClient } from "../db/redis.js";
import { publishAssignmentEvent } from "./events.js";

const redis = createRedisClient();

function keyFor(assignmentId: string) {
  return `assignment:${assignmentId}:state`;
}

export async function saveJobState(event: AssignmentEvent) {
  await redis.set(keyFor(event.assignmentId), JSON.stringify(event), "EX", 60 * 60 * 24);
  await publishAssignmentEvent(event);
}

export async function getJobState(assignmentId: string) {
  const raw = await redis.get(keyFor(assignmentId));
  return raw ? (JSON.parse(raw) as AssignmentEvent) : null;
}
