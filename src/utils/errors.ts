export class ActionsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ConfigError extends ActionsError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super('CONFIG_ERROR', message, metadata);
  }
}

export class ValidationError extends ActionsError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, metadata);
  }
}

export class ToolNotFoundError extends ActionsError {
  constructor(toolName: string) {
    super('TOOL_NOT_FOUND', `Tool "${toolName}" is not registered`, { toolName });
  }
}

export class ToolExecutionError extends ActionsError {
  constructor(toolName: string, message: string, metadata?: Record<string, unknown>) {
    super('TOOL_EXECUTION_ERROR', `[${toolName}] ${message}`, metadata);
  }
}

export class MaxIterationsError extends ActionsError {
  constructor(maxIterations: number) {
    super('MAX_ITERATIONS', `Reached max iterations (${maxIterations})`, { maxIterations });
  }
}

export class ProviderError extends ActionsError {
  constructor(provider: string, message: string, metadata?: Record<string, unknown>) {
    super('PROVIDER_ERROR', `[${provider}] ${message}`, metadata);
  }
}

export class SandboxViolationError extends ActionsError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super('SANDBOX_VIOLATION', message, metadata);
  }
}

export class ConsentDeniedError extends ActionsError {
  constructor(toolName: string) {
    super('CONSENT_DENIED', `Consent denied for tool "${toolName}"`, { toolName });
  }
}

export class ConversationNotFoundError extends ActionsError {
  constructor(conversationId: string) {
    super('CONVERSATION_NOT_FOUND', `Conversation "${conversationId}" was not found`, {
      conversationId,
    });
  }
}

export class TaskNotFoundError extends ActionsError {
  constructor(taskId: string) {
    super('TASK_NOT_FOUND', `Task "${taskId}" was not found`, { taskId });
  }
}
