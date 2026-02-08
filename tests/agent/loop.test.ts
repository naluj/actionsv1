import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runAgentLoopStream } from '../../src/agent/loop';
import { DisabledMemoryManager } from '../../src/agent/memory';
import { StateManager } from '../../src/agent/state';
import { ToolRegistry } from '../../src/tools/registry';
import type { AnyTool } from '../../src/tools/base';
import { ToolExecutor } from '../../src/agent/executor';
import { AutoApproveConsent } from '../../src/security/consent';
import { AuditLogger } from '../../src/security/audit';
import type { LLMProvider, ProviderMessage } from '../../src/providers/types';

class SequencedProvider implements LLMProvider {
  name = 'test';
  supportsFunctions = true;
  private calls = 0;

  async complete(_messages: ProviderMessage[]) {
    this.calls += 1;

    if (this.calls === 1) {
      return {
        content: 'I will use a tool.',
        toolCalls: [
          {
            id: 'call-1',
            name: 'echo_tool',
            arguments: { text: 'hello' },
          },
        ],
      };
    }

    return {
      content: 'Tool completed.',
      toolCalls: undefined,
    };
  }
}

describe('runAgentLoopStream', () => {
  it('emits tool and done events', async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'actions-v1-loop-'));
    const tools = new ToolRegistry();
    const echoTool: AnyTool = {
      name: 'echo_tool',
      type: 'spawn',
      description: 'Echo text',
      requiresConsent: false,
      parameters: z.object({ text: z.string() }),
      async execute(args: { text: string }) {
        return { echoed: args.text };
      },
    };
    tools.register(echoTool);

    const state = new StateManager();
    const logger = pino({ enabled: false });

    const executor = new ToolExecutor({
      agentId: 'agent-test',
      logger,
      state,
      registry: tools,
      consentHandler: new AutoApproveConsent(),
      auditLogger: new AuditLogger(false, path.join(temp, 'audit.log')),
      runtimeContext: {
        workspaceRoot: temp,
        sandboxConfig: {
          workspaceRoot: temp,
          restrictToWorkspace: true,
          blockedCommands: [],
          blockedPaths: [],
        },
        commandTimeoutMs: 500,
        logger,
      },
    });

    const events = [] as Array<{ type: string }>;
    for await (const event of runAgentLoopStream(
      {
        conversationId: '11111111-1111-4111-8111-111111111111',
        message: 'Say hello',
      },
      {
        logger,
        provider: new SequencedProvider(),
        tools,
        memory: new DisabledMemoryManager(),
        state,
        executor,
        maxIterations: 4,
        temperature: 0,
        maxTokens: 200,
        systemPrompt: 'You are helpful.',
        memoryRetrievalLimit: 5,
      },
    )) {
      events.push({ type: event.type });
    }

    expect(events.map((event) => event.type)).toContain('tool_call');
    expect(events.map((event) => event.type)).toContain('tool_result');
    expect(events.at(-1)?.type).toBe('done');
  });
});
