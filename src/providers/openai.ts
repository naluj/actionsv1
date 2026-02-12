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
    const compatibilityModes = this.getCompatibilityModes(options);
    let lastError: unknown = null;

    for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex += 1) {
      const model = candidateModels[modelIndex];

      for (let modeIndex = 0; modeIndex < compatibilityModes.length; modeIndex += 1) {
        const mode = compatibilityModes[modeIndex]!;
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
            tools: mode.includeTools
              ? options?.tools?.map((tool) => ({
                  type: 'function',
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                }))
              : undefined,
            temperature: mode.includeTemperature ? options?.temperature : undefined,
            max_tokens: mode.includeMaxTokens ? options?.maxTokens : undefined,
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

          const hasNextMode = modeIndex < compatibilityModes.length - 1;
          const hasNextModel = modelIndex < candidateModels.length - 1;
          const shouldRetry = hasNextMode || hasNextModel;

          if (!shouldRetry || !this.shouldRetryInCompatibilityMode(error)) {
            throw new ProviderError(this.name, error instanceof Error ? error.message : String(error));
          }
        }
      }
    }

    throw new ProviderError(this.name, lastError instanceof Error ? lastError.message : String(lastError));
  }

  private shouldRetryInCompatibilityMode(error: unknown): boolean {
    const status = Number((error as { status?: unknown })?.status ?? 0);
    return status === 400 || status === 404;
  }

  private getCompatibilityModes(options?: CompletionOptions): Array<{
    includeTools: boolean;
    includeTemperature: boolean;
    includeMaxTokens: boolean;
  }> {
    const modes = [
      {
        includeTools: true,
        includeTemperature: true,
        includeMaxTokens: true,
      },
    ];

    if (options?.tools && options.tools.length > 0) {
      modes.push(
        {
          includeTools: false,
          includeTemperature: true,
          includeMaxTokens: true,
        },
        {
          includeTools: false,
          includeTemperature: false,
          includeMaxTokens: false,
        },
      );
    } else {
      modes.push({
        includeTools: false,
        includeTemperature: false,
        includeMaxTokens: false,
      });
    }

    return modes;
  }

  private getCandidateModels(model: string): string[] {
    const models = [model];
    if (this.providerName !== 'gemini') {
      return models;
    }

    let next = this.mapGeminiFallback(model);
    while (next && !models.includes(next)) {
      models.push(next);
      next = this.mapGeminiFallback(next);
    }

    return models;
  }

  private mapGeminiFallback(model: string): string | null {
    if (model === 'gemini-3-flash') return 'gemini-3-flash-preview';
    if (model === 'gemini-3-pro') return 'gemini-3-pro-preview';
    if (model === 'gemini-3-flash-preview') return 'gemini-2.5-flash';
    if (model === 'gemini-3-pro-preview') return 'gemini-2.5-pro';
    if (model === 'gemini-2.5-flash') return 'gemini-2.5-flash-latest';
    if (model === 'gemini-2.5-pro') return 'gemini-2.5-pro-latest';
    return null;
  }
}
