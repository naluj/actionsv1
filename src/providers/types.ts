export type ProviderMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ProviderToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ProviderToolSchema[];
}

export interface LLMResponse {
  content: string;
  toolCalls?: ProviderToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  supportsFunctions: boolean;
  complete(messages: ProviderMessage[], options?: CompletionOptions): Promise<LLMResponse>;
}
