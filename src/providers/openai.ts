import OpenAI from 'openai';

import { ProviderError } from '../utils/errors';
import { BaseProvider } from './base';
import type { CompletionOptions, LLMResponse, ProviderMessage } from './types';

interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  apiBase?: string;
}

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  readonly supportsFunctions = true;

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIProviderOptions) {
    super();
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiBase,
    });
  }

  async complete(messages: ProviderMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages.map((message) => {
          if (message.role === 'tool') {
            return {
              role: 'tool',
              content: message.content,
              tool_call_id: message.toolCallId ?? '',
            };
          }

          return {
            role: message.role,
            content: message.content,
          };
        }),
        tools: options?.tools?.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      } as any);

      const firstChoice = response.choices[0]?.message;
      const content = firstChoice?.content ?? '';
      const toolCalls = firstChoice?.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: this.parseJsonArguments(call.function.arguments),
      }));

      return {
        content,
        toolCalls: this.normalizeToolCalls(toolCalls),
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    } catch (error) {
      throw new ProviderError(this.name, error instanceof Error ? error.message : String(error));
    }
  }
}
