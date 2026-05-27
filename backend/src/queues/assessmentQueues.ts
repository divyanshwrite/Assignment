import { Queue, QueueEvents } from "bullmq";
import { createQueueConnection } from "../db/redis.js";

export const generationQueueName = "assessment-generation";
export const pdfQueueName = "assessment-pdf";

export const generationQueue = new Queue(generationQueueName, {
  connection: createQueueConnection() as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const pdfQueue = new Queue(pdfQueueName, {
  connection: createQueueConnection() as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const pdfQueueEvents = new QueueEvents(pdfQueueName, {
  connection: createQueueConnection() as any
});
