export type AgentType = 'actions_v1' | 'openclaw';
export type AgentStatus = 'initializing' | 'ready' | 'busy' | 'error' | 'stopped';
export type VMStatus = 'provisioning' | 'running' | 'stopped' | 'error' | 'deleted';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type TaskType = 'file' | 'shell' | 'browser' | 'spawn';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  result: Record<string, unknown>;
  error: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  agentId: string;
  messageId?: string;
  type: TaskType;
  payload: Record<string, unknown>;
  status: TaskStatus;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface AgentModelConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'kimi' | 'ollama';
  model: string;
  temperature: number;
  maxIterations: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AgentRunInput {
  conversationId: string;
  message: string;
}

export interface AgentRunResult {
  response: string;
  toolCalls: ToolCallResult[];
  iterations: number;
  conversationId: string;
}

export type AgentStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: Record<string, unknown> }
  | { type: 'done'; content: string };
