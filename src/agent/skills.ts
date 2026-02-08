import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AnyTool } from '../tools/base';

function isTool(candidate: unknown): candidate is AnyTool {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  const object = candidate as Record<string, unknown>;
  return (
    typeof object.name === 'string' &&
    typeof object.description === 'string' &&
    typeof object.execute === 'function' &&
    typeof object.requiresConsent === 'boolean' &&
    typeof object.type === 'string' &&
    typeof object.parameters === 'object'
  );
}

export class SkillsLoader {
  constructor(private readonly skillsDir: string) {}

  async loadSkillInstructions(): Promise<string[]> {
    const directories = await this.listSkillDirectories();
    const instructions: string[] = [];

    for (const directory of directories) {
      const skillDocPath = path.join(directory, 'SKILL.md');
      try {
        const content = await fs.readFile(skillDocPath, 'utf8');
        instructions.push(content.trim());
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return instructions;
  }

  async loadTools(): Promise<AnyTool[]> {
    const directories = await this.listSkillDirectories();
    const tools: AnyTool[] = [];

    for (const directory of directories) {
      const candidates = ['index.js', 'index.ts'];
      for (const candidate of candidates) {
        const modulePath = path.join(directory, candidate);
        try {
          await fs.access(modulePath);
          const loaded = await import(pathToFileURL(modulePath).href);
          const exported = loaded.default ?? loaded.tool ?? loaded;

          if (Array.isArray(exported)) {
            tools.push(...exported.filter(isTool));
          } else if (isTool(exported)) {
            tools.push(exported);
          }

          break;
        } catch (error) {
          const maybeNodeError = error as NodeJS.ErrnoException & { code?: string };
          const code = maybeNodeError.code;
          const recoverable = new Set(['ENOENT', 'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_UNKNOWN_FILE_EXTENSION']);
          if (!code || !recoverable.has(code)) {
            throw error;
          }
        }
      }
    }

    return tools;
  }

  private async listSkillDirectories(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(this.skillsDir, entry.name));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
