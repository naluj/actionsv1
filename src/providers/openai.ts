import OpenAI from 'openai';

import { ProviderError } from '../utils/errors';
import { BaseProvider } from './base';
import type { CompletionOptions, LLMResponse, ProviderMessage } from './types';

interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  apiBase?: string;
  providerName?: string;
}

export class OpenAIProvider extends BaseProvider {
  readonly name: string;
  readonly supportsFunctions = true;

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly providerName: string;

  constructor(options: OpenAIProviderOptions) {
    super();
    this.providerName = options.providerName ?? 'openai';
    this.name = this.providerName;
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiBase,
    });
  }

  async complete(messages: ProviderMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    const candidateModels = this.getCandidateModels(this.model);
    let lastError: unknown = null;

    for (let index = 0; index < candidateModels.length; index += 1) {
      const model = candidateModels[index];
      try {
        const response = await this.client.chat.completions.create({
          model,
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
        lastError = error;

        const canRetry = index < candidateModels.length - 1;
        if (!canRetry || !this.shouldRetryWithFallbackModel(error)) {
          break;
        }
      }
    }

    throw new ProviderError(this.name, lastError instanceof Error ? lastError.message : String(lastError));
  }

  private shouldRetryWithFallbackModel(error: unknown): boolean {
    const status = Number((error as { status?: unknown })?.status ?? 0);
    return status === 404;
  }

  private getCandidateModels(model: string): string[] {
    const models = [model];
    if (this.providerName !== 'gemini') {
      return models;
    }

    const fallback = this.mapGeminiFallback(model);
    if (fallback && fallback !== model) {
      models.push(fallback);
    }

    return models;
  }

  private mapGeminiFallback(model: string): string | null {
    if (model === 'gemini-3-flash') return 'gemini-3-flash-preview';
    if (model === 'gemini-3-pro') return 'gemini-3-pro-preview';
    if (model === 'gemini-3-flash-preview') return 'gemini-3-flash';
    if (model === 'gemini-3-pro-preview') return 'gemini-3-pro';
    return null;
  }
}
