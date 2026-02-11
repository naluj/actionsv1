import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid(),
  stream: z.boolean().default(true),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const appOperationRequestSchema = z.object({
  installId: z.string().min(1),
  slug: z.string().min(1),
  script: z.string().min(1),
});

export type AppOperationRequest = z.infer<typeof appOperationRequestSchema>;
