import { ProviderError } from '../utils/errors';
import { BaseProvider } from './base';
import type { CompletionOptions, LLMResponse, ProviderMessage } from './types';

interface OllamaProviderOptions {
  model: string;
  apiBase: string;
}

interface OllamaResponse {
  message?: {
    role?: string;
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseProvider {
  readonly name = 'ollama';
  readonly supportsFunctions = false;

  constructor(
    private readonly options: OllamaProviderOptions,
  ) {
    super();
  }

  async complete(messages: ProviderMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    const augmentedMessages = this.injectToolPrompt(messages, options);

    try {
      const response = await fetch(`${this.options.apiBase}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          messages: augmentedMessages,
          options: {
            temperature: options?.temperature,
            num_predict: options?.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as OllamaResponse;
      const content = payload.message?.content ?? '';
      const parsed = this.parsePromptToolCalls(content);

      return {
        content: parsed.content,
        toolCalls: this.normalizeToolCalls(parsed.toolCalls),
        usage: {
          promptTokens: payload.prompt_eval_count ?? 0,
          completionTokens: payload.eval_count ?? 0,
        },
      };
    } catch (error) {
      throw new ProviderError(this.name, error instanceof Error ? error.message : String(error));
    }
  }

  private injectToolPrompt(messages: ProviderMessage[], options?: CompletionOptions): ProviderMessage[] {
    if (!options?.tools || options.tools.length === 0) {
      return messages;
    }

    const toolPrompt = [
      'When you need a tool, respond ONLY with compact JSON using:',
      '{"toolCalls":[{"id":"call-id","name":"tool-name","arguments":{...}}],"content":"optional assistant text"}',
      'Available tools:',
      ...options.tools.map((tool) => `- ${tool.name}: ${tool.description}`),
    ].join('\n');

    return [{ role: 'system', content: toolPrompt }, ...messages];
  }

  private parsePromptToolCalls(content: string): { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> } {
    try {
      const parsed = JSON.parse(content) as {
        content?: string;
        toolCalls?: Array<{ id?: string; name: string; arguments?: Record<string, unknown> }>;
      };

      if (!parsed.toolCalls?.length) {
        return { content };
      }

      return {
        content: parsed.content ?? '',
        toolCalls: parsed.toolCalls.map((toolCall, index) => ({
          id: toolCall.id ?? `ollama-call-${index + 1}`,
          name: toolCall.name,
          arguments: toolCall.arguments ?? {},
        })),
      };
    } catch {
      return { content };
    }
  }
}
