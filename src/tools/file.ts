import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { resolvePathInsideWorkspace } from '../security/sandbox';
import type { ToolDefinition } from './types';

const fileToolSchema = z.object({
  action: z.enum(['read', 'write', 'list', 'delete']),
  path: z.string().min(1),
  content: z.string().optional(),
});

export const fileTool: ToolDefinition<typeof fileToolSchema> = {
  name: 'file',
  type: 'file',
  description: 'Read, write, list, or delete files inside the workspace',
  parameters: fileToolSchema,
  requiresConsent: true,
  async execute(args, context) {
    const absolutePath = resolvePathInsideWorkspace(args.path, context.sandboxConfig);

    if (args.action === 'read') {
      const content = await fs.readFile(absolutePath, 'utf8');
      return { path: absolutePath, content };
    }

    if (args.action === 'write') {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, args.content ?? '', 'utf8');
      return { path: absolutePath, success: true };
    }

    if (args.action === 'list') {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      return {
        path: absolutePath,
        files: entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file' })),
      };
    }

    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      await fs.rm(absolutePath, { recursive: true, force: true });
    } else {
      await fs.unlink(absolutePath);
    }

    return { path: absolutePath, success: true };
  },
};
