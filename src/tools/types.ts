import type { Logger } from 'pino';
import type { z } from 'zod';

import type { TaskType } from '../agent/types';
import type { SandboxConfig } from '../security/sandbox';
import type { SubagentManager } from '../agent/subagent';

export type ToolTaskType = TaskType | (string & {});

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolRuntimeContext {
  workspaceRoot: string;
  sandboxConfig: SandboxConfig;
  commandTimeoutMs: number;
  logger: Logger;
  subagentManager?: SubagentManager;
}

export interface ToolDefinition<TArgs extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  type: ToolTaskType;
  description: string;
  parameters: TArgs;
  requiresConsent: boolean;
  execute(args: z.infer<TArgs>, context: ToolRuntimeContext): Promise<Record<string, unknown>>;
}

export interface ToolCallInput {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDispatchResult {
  type: ToolTaskType;
  output: Record<string, unknown>;
}
