import { zodToJsonSchema } from 'zod-to-json-schema';

import { ToolNotFoundError, ToolExecutionError } from '../utils/errors';
import { withTimeout } from '../utils/async';
import type { AnyTool } from './base';
import type { ToolRuntimeContext, ToolSchema } from './types';

export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    this.tools.set(tool.name, tool);
  }

  list(): AnyTool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AnyTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  requiresConsent(name: string): boolean {
    return this.get(name).requiresConsent;
  }

  getType(name: string): string {
    return this.get(name).type;
  }

  getSchemas(): ToolSchema[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: (zodToJsonSchema(tool.parameters as any, {
        target: 'openApi3',
        $refStrategy: 'none',
      }) as Record<string, unknown>) ?? { type: 'object' },
    }));
  }

  async execute(name: string, args: Record<string, unknown>, context: ToolRuntimeContext): Promise<Record<string, unknown>> {
    const tool = this.get(name);

    try {
      const validated = tool.parameters.parse(args);
      return await withTimeout(
        tool.execute(validated, context),
        context.commandTimeoutMs,
        `tool:${name}`,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new ToolExecutionError(name, error.message, { cause: error.name });
      }
      throw new ToolExecutionError(name, 'Unknown tool execution error');
    }
  }
}
