import path from 'node:path';

import { SandboxViolationError } from '../utils/errors';

export interface SandboxConfig {
  workspaceRoot: string;
  restrictToWorkspace: boolean;
  blockedCommands: string[];
  blockedPaths: string[];
}

export function resolvePathInsideWorkspace(targetPath: string, config: SandboxConfig): string {
  const workspaceRoot = path.resolve(config.workspaceRoot);
  const resolvedPath = path.resolve(workspaceRoot, targetPath);

  if (config.restrictToWorkspace && !resolvedPath.startsWith(workspaceRoot)) {
    throw new SandboxViolationError(`Path "${targetPath}" resolves outside workspace`, {
      workspaceRoot,
      resolvedPath,
    });
  }

  for (const blocked of config.blockedPaths) {
    if (resolvedPath.includes(blocked)) {
      throw new SandboxViolationError(`Path "${targetPath}" includes blocked segment "${blocked}"`);
    }
  }

  return resolvedPath;
}

export function assertWithinWorkspace(targetPath: string, config: SandboxConfig): void {
  resolvePathInsideWorkspace(targetPath, config);
}

export function assertCommandAllowed(command: string, config: SandboxConfig): void {
  for (const pattern of config.blockedCommands) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(command)) {
      throw new SandboxViolationError(`Command blocked by policy: ${pattern}`, { command, pattern });
    }
  }
}

export function sanitizeCwd(cwd: string | undefined, config: SandboxConfig): string {
  if (!cwd) {
    return path.resolve(config.workspaceRoot);
  }

  return resolvePathInsideWorkspace(cwd, config);
}
