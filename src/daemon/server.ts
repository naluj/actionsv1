import Fastify from 'fastify';

import { loadConfig } from '../config/loader';
import { createAgent, type ActionsAgent } from '../agent/runner';
import { chatRequestSchema } from './types';
import { logger } from '../utils/logger';
import { ConversationNotFoundError, TaskNotFoundError } from '../utils/errors';

export interface ServerBootstrapOptions {
  configPath?: string;
  agent?: ActionsAgent;
}

export async function createDaemonServer(options: ServerBootstrapOptions = {}) {
  const config = await loadConfig(options.configPath);
  const agent = options.agent ?? createAgent(config, { logger });
  try {
    await agent.loadSkills();
  } catch (error) {
    logger.warn({ error }, 'Failed to load one or more skills; continuing without them');
  }

  const app = Fastify({
    loggerInstance: logger,
  });

  app.get('/health', async () => ({
    status: agent.getStatus(),
    version: agent.getVersion(),
  }));

  app.post('/chat', async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;

    if (!body.stream) {
      const result = await agent.run({
        conversationId: body.conversationId,
        message: body.message,
      });
      return reply.send({ content: result.response });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    try {
      for await (const event of agent.runStream({
        conversationId: body.conversationId,
        message: body.message,
      })) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.raw.write(`data: ${JSON.stringify({ type: 'done', content: `Error: ${message}` })}\n\n`);
    }

    reply.raw.end();
    return reply;
  });

  app.get('/conversations/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return reply.send({
        messages: agent.getConversationMessages(id),
      });
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        return reply.code(404).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });

  app.get('/tasks', async (_request, reply) => {
    return reply.send({
      tasks: agent.listTasks(),
    });
  });

  app.get('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return reply.send({
        task: agent.getTask(id),
      });
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return reply.code(404).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });

  app.put('/config', async (request, reply) => {
    agent.updateConfig(request.body as Record<string, unknown>);
    return reply.send({ success: true });
  });

  return app;
}

export async function startDaemon(options: ServerBootstrapOptions = {}) {
  const app = await createDaemonServer(options);
  const config = await loadConfig(options.configPath);

  await app.listen({
    host: config.daemon.host,
    port: 3000,
  });

  return app;
}

if (require.main === module) {
  void startDaemon().catch((error) => {
    logger.error({ error }, 'Failed to start daemon');
    process.exit(1);
  });
}
