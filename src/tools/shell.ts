import { spawn } from 'node:child_process';

import { z } from 'zod';

import { assertCommandAllowed, sanitizeCwd } from '../security/sandbox';
import type { ToolDefinition } from './types';

const shellToolSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
});

export const shellTool: ToolDefinition<typeof shellToolSchema> = {
  name: 'shell',
  type: 'shell',
  description: 'Execute shell commands within the workspace sandbox',
  parameters: shellToolSchema,
  requiresConsent: true,
  async execute(args, context) {
    assertCommandAllowed(args.command, context.sandboxConfig);

    const cwd = sanitizeCwd(args.cwd, context.sandboxConfig);
    const timeoutMs = args.timeoutMs ?? context.commandTimeoutMs;

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const proc = spawn('sh', ['-lc', args.command], {
        cwd,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? (timedOut ? -1 : 0),
          stdout,
          stderr,
          timedOut,
          cwd,
        });
      });
    });
  },
};
