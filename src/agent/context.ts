import type { Message, ToolCall, ToolCallResult } from './types';
import type { MemoryEntry } from './memory';
import type { ProviderMessage } from '../providers/types';
import type { ToolSchema } from '../tools/types';

interface ContextConfig {
  systemPrompt?: string;
  memory: MemoryEntry[];
  history: Message[];
  userMessage: string;
  availableTools: ToolSchema[];
}

function buildSystemPrompt(systemPrompt: string | undefined, tools: ToolSchema[]): string {
  const prefix = systemPrompt ?? 'You are a helpful AI assistant.';

  if (tools.length === 0) {
    return prefix;
  }

  const toolLines = tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return `${prefix}\n\nAvailable tools:\n${toolLines}\n\nUse tools when needed.`;
}

function formatMemory(memory: MemoryEntry[]): string {
  return memory
    .map((entry) => `- [${entry.timestamp}] ${entry.content}`)
    .join('\n');
}

export function buildContext(config: ContextConfig): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  messages.push({
    role: 'system',
    content: buildSystemPrompt(config.systemPrompt, config.availableTools),
  });

  if (config.memory.length > 0) {
    messages.push({
      role: 'system',
      content: `Relevant memory:\n${formatMemory(config.memory)}`,
    });
  }

  for (const message of config.history) {
    messages.push({
      role: message.role,
      content: message.content,
    });
  }

  messages.push({
    role: 'user',
    content: config.userMessage,
  });

  return messages;
}

export function appendToolResults(
  context: ProviderMessage[],
  assistantContent: string,
  toolCalls: ToolCall[],
  toolResults: ToolCallResult[],
): ProviderMessage[] {
  const nextContext = [...context];

  nextContext.push({
    role: 'assistant',
    content: assistantContent || 'Tool execution requested.',
  });

  for (const toolResult of toolResults) {
    const originalCall = toolCalls.find((call) => call.id === toolResult.toolCallId);
    nextContext.push({
      role: 'tool',
      toolCallId: toolResult.toolCallId,
      toolName: originalCall?.name,
      content: JSON.stringify(toolResult.result),
    });
  }

  return nextContext;
}
