import { z } from 'zod';

const providerSchema = z.object({
  apiKey: z.string().min(1),
  apiBase: z.string().url().optional(),
  model: z.string().min(1),
});

export const appConfigSchema = z.object({
  providers: z.object({
    openai: providerSchema.optional(),
    anthropic: providerSchema.optional(),
    gemini: providerSchema.optional(),
    kimi: providerSchema.optional(),
    ollama: z
      .object({
        apiBase: z.string().url().default('http://localhost:11434'),
        model: z.string().default('llama3.1'),
      })
      .optional(),
  }),
  agent: z.object({
    provider: z.enum(['openai', 'anthropic', 'gemini', 'kimi', 'ollama']).default('openai'),
    model: z.string().min(1),
    maxIterations: z.number().int().positive().max(30).default(10),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }),
  tools: z.object({
    restrictToWorkspace: z.boolean().default(true),
    workspaceRoot: z.string().default('./workspace'),
    blockedCommands: z.array(z.string()).default(['(^|\\s)sudo(\\s|$)', 'rm\\s+-rf\\s+/', 'shutdown', 'reboot']),
    blockedPaths: z.array(z.string()).default(['.git', '.env']),
    enabledTools: z.array(z.enum(['file', 'shell', 'browser', 'spawn'])).default(['file', 'shell', 'browser', 'spawn']),
    commandTimeoutMs: z.number().int().positive().default(30000),
  }),
  memory: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('./memory.json'),
    maxEntries: z.number().int().positive().default(1000),
    retrievalLimit: z.number().int().positive().default(10),
  }),
  daemon: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().positive().default(3000),
  }),
  audit: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('./audit.log'),
  }),
  appStore: z
    .object({
      enabled: z.boolean().default(true),
      callbackUrl: z.string().url().optional(),
      callbackToken: z.string().min(1).optional(),
      callbackTimeoutMs: z.number().int().positive().default(10000),
      maxTrackedJobs: z.number().int().positive().max(500).default(100),
    })
    .optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
