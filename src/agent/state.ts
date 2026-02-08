import { randomUUID } from 'node:crypto';

import type { Conversation, Message, MessageRole, TaskRecord, TaskStatus, TaskType, ToolCall, ToolCallResult } from './types';
import { ConversationNotFoundError, TaskNotFoundError } from '../utils/errors';

export class StateManager {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message[]>();
  private readonly tasks = new Map<string, TaskRecord>();

  ensureConversation(conversationId: string): Conversation {
    const existing = this.conversations.get(conversationId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: conversationId,
      title: 'New Conversation',
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(conversationId, conversation);
    this.messages.set(conversationId, []);
    return conversation;
  }

  appendMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolCallResult[];
  }): Message {
    const conversation = this.ensureConversation(params.conversationId);
    const list = this.messages.get(params.conversationId) ?? [];

    const message: Message = {
      id: randomUUID(),
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      toolCalls: params.toolCalls,
      toolResults: params.toolResults,
      createdAt: new Date().toISOString(),
    };

    list.push(message);
    this.messages.set(params.conversationId, list);

    conversation.updatedAt = new Date().toISOString();
    this.conversations.set(params.conversationId, conversation);

    return message;
  }

  getConversationMessages(conversationId: string): Message[] {
    const messages = this.messages.get(conversationId);
    if (!messages) {
      throw new ConversationNotFoundError(conversationId);
    }
    return [...messages];
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createTask(params: {
    agentId: string;
    messageId?: string;
    type: TaskType;
    payload: Record<string, unknown>;
  }): TaskRecord {
    const task: TaskRecord = {
      id: randomUUID(),
      agentId: params.agentId,
      messageId: params.messageId,
      type: params.type,
      payload: params.payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    return task;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, patch: Partial<TaskRecord> = {}): TaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const updated: TaskRecord = {
      ...task,
      ...patch,
      status,
    };

    this.tasks.set(taskId, updated);
    return updated;
  }

  markTaskRunning(taskId: string): TaskRecord {
    return this.updateTaskStatus(taskId, 'running', { startedAt: new Date().toISOString() });
  }

  markTaskCompleted(taskId: string, result: Record<string, unknown>): TaskRecord {
    return this.updateTaskStatus(taskId, 'completed', {
      result,
      completedAt: new Date().toISOString(),
    });
  }

  markTaskFailed(taskId: string, error: string): TaskRecord {
    return this.updateTaskStatus(taskId, 'failed', {
      error,
      completedAt: new Date().toISOString(),
    });
  }

  listTasks(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTask(taskId: string): TaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    return task;
  }
}
