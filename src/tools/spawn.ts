import { z } from 'zod';

import type { ToolDefinition } from './types';

const spawnToolSchema = z.object({
  task: z.string().min(1),
  background: z.boolean().default(true),
});

export const spawnTool: ToolDefinition<typeof spawnToolSchema> = {
  name: 'spawn',
  type: 'spawn',
  description: 'Spawn background subagent work',
  parameters: spawnToolSchema,
  requiresConsent: false,
  async execute(args, context) {
    if (!context.subagentManager) {
      return {
        status: 'failed',
        error: 'subagent manager not configured',
      };
    }

    if (args.background) {
      const subagentId = context.subagentManager.spawn(args.task);
      return {
        subagentId,
        status: 'spawned',
      };
    }

    const result = await context.subagentManager.runInline(args.task);
    return {
      subagentId: 'inline',
      status: 'completed',
      result,
    };
  },
};
