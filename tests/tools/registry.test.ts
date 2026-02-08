import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import pino from 'pino';

import { ToolRegistry } from '../../src/tools/registry';
import type { AnyTool } from '../../src/tools/base';

const sampleTool: AnyTool = {
  name: 'math_double',
  type: 'spawn',
  description: 'Doubles a number',
  requiresConsent: false,
  parameters: z.object({
    value: z.number(),
  }),
  async execute(args: { value: number }) {
    return { result: args.value * 2 };
  },
};

describe('ToolRegistry', () => {
  it('registers and executes tools with validation', async () => {
    const registry = new ToolRegistry();
    registry.register(sampleTool);

    const output = await registry.execute(
      'math_double',
      { value: 21 },
      {
        workspaceRoot: process.cwd(),
        sandboxConfig: {
          workspaceRoot: process.cwd(),
          restrictToWorkspace: true,
          blockedCommands: [],
          blockedPaths: [],
        },
        commandTimeoutMs: 500,
        logger: pino({ enabled: false }),
      },
    );

    expect(output).toEqual({ result: 42 });
  });

  it('throws for missing tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.get('missing')).toThrow('not registered');
  });
});
