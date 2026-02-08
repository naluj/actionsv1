import type { Logger } from 'pino';

import { buildContext, appendToolResults } from './context';
import type { MemoryManager } from './memory';
import type { StateManager } from './state';
import type { AgentRunInput, AgentRunResult, AgentStreamEvent, ToolCall, ToolCallResult } from './types';
import type { ToolRegistry } from '../tools/registry';
import type { LLMProvider } from '../providers/types';
import { MaxIterationsError } from '../utils/errors';
import { ToolExecutor } from './executor';

interface AgentLoopConfig {
  logger: Logger;
  provider: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryManager;
  state: StateManager;
  executor: ToolExecutor;
  maxIterations: number;
  temperature: number;
  maxTokens?: number;
  systemPrompt?: string;
  memoryRetrievalLimit: number;
}

export async function runAgentLoop(
  input: AgentRunInput,
  config: AgentLoopConfig,
): Promise<AgentRunResult> {
  const iterator = runAgentLoopStream(input, config);
  let step = await iterator.next();
  while (!step.done) {
    step = await iterator.next();
  }

  return step.value;
}

export async function* runAgentLoopStream(
  input: AgentRunInput,
  config: AgentLoopConfig,
): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
  config.state.ensureConversation(input.conversationId);

  const historyBeforeUser = config.state.getConversationMessages(input.conversationId);
  const userMessage = config.state.appendMessage({
    conversationId: input.conversationId,
    role: 'user',
    content: input.message,
  });

  const memoryEntries = await config.memory.retrieve(input.message, config.memoryRetrievalLimit);

  let context = buildContext({
    systemPrompt: config.systemPrompt,
    memory: memoryEntries,
    history: historyBeforeUser,
    userMessage: input.message,
    availableTools: config.tools.getSchemas(),
  });

  let iterations = 0;
  const allToolCalls: ToolCallResult[] = [];

  while (iterations < config.maxIterations) {
    iterations += 1;

    config.logger.debug({ iteration: iterations }, 'Calling provider');
    const llmResponse = await config.provider.complete(context, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      tools: config.tools.getSchemas(),
    });

    const toolCalls: ToolCall[] = (llmResponse.toolCalls ?? []).map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));

    if (toolCalls.length === 0) {
      const finalResponse = llmResponse.content;
      config.state.appendMessage({
        conversationId: input.conversationId,
        role: 'assistant',
        content: finalResponse,
      });

      await config.memory.store(input.message, finalResponse);

      yield { type: 'token', content: finalResponse };
      yield { type: 'done', content: finalResponse };

      return {
        response: finalResponse,
        toolCalls: allToolCalls,
        iterations,
        conversationId: input.conversationId,
      };
    }

    const assistantToolMessage = config.state.appendMessage({
      conversationId: input.conversationId,
      role: 'assistant',
      content: llmResponse.content || 'Executing tools.',
      toolCalls,
    });

    const toolResults: ToolCallResult[] = [];
    for (const toolCall of toolCalls) {
      yield {
        type: 'tool_call',
        name: toolCall.name,
        arguments: toolCall.arguments,
      };

      const result = await config.executor.execute(toolCall, assistantToolMessage.id);
      allToolCalls.push(result);
      toolResults.push(result);

      yield {
        type: 'tool_result',
        name: result.name,
        result: result.result,
      };

      config.state.appendMessage({
        conversationId: input.conversationId,
        role: 'tool',
        content: JSON.stringify(result.result),
        toolResults: [result],
      });
    }

    context = appendToolResults(context, llmResponse.content, toolCalls, toolResults);
  }

  throw new MaxIterationsError(config.maxIterations);
}
