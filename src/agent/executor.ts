import type { Logger } from 'pino';

import type { TaskType, ToolCall, ToolCallResult } from './types';
import type { StateManager } from './state';
import type { ToolRegistry } from '../tools/registry';
import type { ToolRuntimeContext } from '../tools/types';
import type { ConsentHandler } from '../security/consent';
import type { AuditLogger } from '../security/audit';
import { ConsentDeniedError } from '../utils/errors';

interface ToolExecutorConfig {
  agentId: string;
  logger: Logger;
  state: StateManager;
  registry: ToolRegistry;
  runtimeContext: ToolRuntimeContext;
  consentHandler?: ConsentHandler;
  auditLogger: AuditLogger;
}

const TASK_TYPES: TaskType[] = ['file', 'shell', 'browser', 'spawn'];

function normalizeTaskType(value: string): TaskType {
  if (TASK_TYPES.includes(value as TaskType)) {
    return value as TaskType;
  }
  return 'spawn';
}

export class ToolExecutor {
  constructor(private readonly config: ToolExecutorConfig) {}

  async execute(call: ToolCall, messageId?: string): Promise<ToolCallResult> {
    const taskType = normalizeTaskType(this.config.registry.getType(call.name));
    const task = this.config.state.createTask({
      agentId: this.config.agentId,
      messageId,
      type: taskType,
      payload: {
        name: call.name,
        arguments: call.arguments,
      },
    });

    this.config.state.markTaskRunning(task.id);

    try {
      if (this.config.registry.requiresConsent(call.name) && this.config.consentHandler) {
        const approved = await this.config.consentHandler.requestConsent(call);
        if (!approved) {
          throw new ConsentDeniedError(call.name);
        }
      }

      const result = await this.config.registry.execute(call.name, call.arguments, this.config.runtimeContext);
      this.config.state.markTaskCompleted(task.id, result);

      await this.config.auditLogger.log({
        action: `tool:${call.name}`,
        success: true,
        metadata: {
          taskId: task.id,
          messageId,
        },
      });

      return {
        toolCallId: call.id,
        name: call.name,
        result,
        error: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.config.state.markTaskFailed(task.id, message);

      await this.config.auditLogger.log({
        action: `tool:${call.name}`,
        success: false,
        metadata: {
          taskId: task.id,
          error: message,
        },
      });

      this.config.logger.warn({ error: message, tool: call.name }, 'Tool execution failed');
      return {
        toolCallId: call.id,
        name: call.name,
        result: { error: message },
        error: true,
      };
    }
  }
}
