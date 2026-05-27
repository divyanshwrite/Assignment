import "dotenv/config";
import { z } from "zod";

const csv = (value: unknown) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
};

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional()
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_ORIGIN: optionalUrl,
    CLIENT_ORIGINS: z
      .preprocess((value) => csv(value ?? process.env.CLIENT_ORIGIN), z.array(z.string().url()).min(1))
      .default(["http://localhost:3000"]),
    MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/vedaai-assessment"),
    MONGODB_DNS_SERVERS: z.preprocess(csv, z.array(z.string()).default(["8.8.8.8", "1.1.1.1"])),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    OPENAI_BASE_URL: optionalUrl,
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    APP_NAME: z.string().default("VedaAI Assessment Creator"),
    APP_PUBLIC_URL: optionalUrl
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") {
      return;
    }

    if (value.MONGODB_URI.includes("localhost") || value.REDIS_URL.includes("localhost")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production deployments must use external MONGODB_URI and REDIS_URL values."
      });
    }
  });

export const env = envSchema.parse(process.env);
