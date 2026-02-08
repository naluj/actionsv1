import type { CompletionOptions, LLMProvider, LLMResponse, ProviderMessage, ProviderToolCall } from './types';

export type { CompletionOptions, LLMProvider, LLMResponse, ProviderMessage } from './types';

export abstract class BaseProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly supportsFunctions: boolean;
  abstract complete(messages: ProviderMessage[], options?: CompletionOptions): Promise<LLMResponse>;

  protected parseJsonArguments(value: string): Record<string, unknown> {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { raw: value };
    }
  }

  protected normalizeToolCalls(toolCalls: ProviderToolCall[] | undefined): ProviderToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
      return undefined;
    }
    return toolCalls;
  }
}
