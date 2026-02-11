import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { createAgent } from '../../src/agent/runner';
import { createDaemonServer } from '../../src/daemon/server';
import type { AppConfig } from '../../src/config/schema';
import type { LLMProvider, ProviderMessage } from '../../src/providers/types';

class MockProvider implements LLMProvider {
  name = 'mock';
  supportsFunctions = false;

  async complete(_messages: ProviderMessage[]) {
    return {
      content: 'pong',
      toolCalls: undefined,
    };
  }
}

function buildConfig(tempDir: string): AppConfig {
  return {
    providers: {
      ollama: {
        apiBase: 'http://localhost:11434',
        model: 'llama3.1',
      },
    },
    agent: {
      provider: 'ollama',
      model: 'llama3.1',
      maxIterations: 3,
      temperature: 0,
      systemPrompt: 'Test',
    },
    tools: {
      restrictToWorkspace: true,
      workspaceRoot: tempDir,
      blockedCommands: [],
      blockedPaths: [],
      enabledTools: ['file', 'shell', 'browser', 'spawn'],
      commandTimeoutMs: 500,
    },
    memory: {
      enabled: false,
      path: path.join(tempDir, 'memory.json'),
      maxEntries: 100,
      retrievalLimit: 5,
    },
    daemon: {
      host: '0.0.0.0',
      port: 3000,
    },
    audit: {
      enabled: false,
      path: path.join(tempDir, 'audit.log'),
    },
  };
}

describe('daemon API', () => {
  it('serves health/chat/messages/tasks/config endpoints', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'actions-v1-daemon-'));
    const agent = createAgent(buildConfig(tempDir), {
      provider: new MockProvider(),
      logger: pino({ enabled: false }),
    });

    const app = await createDaemonServer({ agent });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ version: '1.0.0' });

    const conversationId = '22222222-2222-4222-8222-222222222222';
    const chat = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'ping',
        conversationId,
        stream: false,
      },
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json()).toEqual({ content: 'pong' });

    const messages = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json().messages.length).toBeGreaterThanOrEqual(2);

    const tasks = await app.inject({ method: 'GET', url: '/tasks' });
    expect(tasks.statusCode).toBe(200);
    expect(Array.isArray(tasks.json().tasks)).toBe(true);

    const configUpdate = await app.inject({
      method: 'PUT',
      url: '/config',
      payload: {
        agent: {
          temperature: 0.2,
        },
      },
    });
    expect(configUpdate.statusCode).toBe(200);
    expect(configUpdate.json()).toEqual({ success: true });

    const install = await app.inject({
      method: 'POST',
      url: '/apps/install',
      payload: {
        installId: 'install-test-1',
        slug: 'git',
        script: 'echo installing-git',
      },
    });
    expect(install.statusCode).toBe(200);
    expect(install.json()).toMatchObject({
      status: 'installing',
      installId: 'install-test-1',
      slug: 'git',
    });

    await new Promise((resolve) => setTimeout(resolve, 40));
    const appStatus = await app.inject({
      method: 'GET',
      url: '/apps/status?installId=install-test-1',
    });
    expect(appStatus.statusCode).toBe(200);
    expect(appStatus.json().job).toMatchObject({
      installId: 'install-test-1',
      operation: 'install',
    });

    await app.close();
  });
});
