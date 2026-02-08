import Anthropic from '@anthropic-ai/sdk';

import { ProviderError } from '../utils/errors';
import { BaseProvider } from './base';
import type { CompletionOptions, LLMResponse, ProviderMessage } from './types';

interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  apiBase?: string;
}

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly supportsFunctions = true;

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    super();
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.apiBase,
    });
  }

  async complete(messages: ProviderMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const systemMessage = messages.find((msg) => msg.role === 'system')?.content;

      const anthropicMessages = messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.role === 'tool' ? `[tool:${message.toolName ?? 'tool'}] ${message.content}` : message.content,
        }));

      const response = await this.client.messages.create({
        model: this.model,
        system: systemMessage,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature,
        tools: options?.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
      } as any);

      const content = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      const toolCalls = response.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, unknown>) ?? {},
        }));

      return {
        content,
        toolCalls: this.normalizeToolCalls(toolCalls),
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
            }
          : undefined,
      };
    } catch (error) {
      throw new ProviderError(this.name, error instanceof Error ? error.message : String(error));
    }
  }
}
