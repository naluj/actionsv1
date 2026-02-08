import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid(),
  stream: z.boolean().default(true),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
