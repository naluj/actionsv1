import Fastify from 'fastify';
import { spawn } from 'node:child_process';

import { loadConfig } from '../config/loader';
import { createAgent, type ActionsAgent } from '../agent/runner';
import { appOperationRequestSchema, chatRequestSchema } from './types';
import { logger } from '../utils/logger';
import { ConversationNotFoundError, TaskNotFoundError } from '../utils/errors';

export interface ServerBootstrapOptions {
  configPath?: string;
  agent?: ActionsAgent;
}

export async function createDaemonServer(options: ServerBootstrapOptions = {}) {
  const config = await loadConfig(options.configPath);
  const agent = options.agent ?? createAgent(config, { logger });
  const appJobs = new Map<string, AppJob>();
  const maxTrackedJobs = config.appStore?.maxTrackedJobs ?? 100;
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

  app.post('/apps/install', async (request, reply) => {
    const parsed = appOperationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;
    const activeJob = appJobs.get(body.installId);
    if (activeJob && activeJob.status === 'running') {
      return reply.code(409).send({
        error: 'install_already_running',
        installId: body.installId,
      });
    }

    const job: AppJob = {
      installId: body.installId,
      slug: body.slug,
      operation: 'install',
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      message: null,
    };

    trackJob(appJobs, maxTrackedJobs, job);
    void runAppOperation({
      job,
      script: body.script,
      callback: config.appStore,
      appJobs,
    });

    return reply.send({
      status: 'installing',
      installId: job.installId,
      slug: job.slug,
    });
  });

  app.post('/apps/uninstall', async (request, reply) => {
    const parsed = appOperationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;
    const activeJob = appJobs.get(body.installId);
    if (activeJob && activeJob.status === 'running') {
      return reply.code(409).send({
        error: 'uninstall_already_running',
        installId: body.installId,
      });
    }

    const job: AppJob = {
      installId: body.installId,
      slug: body.slug,
      operation: 'uninstall',
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      message: null,
    };

    trackJob(appJobs, maxTrackedJobs, job);
    void runAppOperation({
      job,
      script: body.script,
      callback: config.appStore,
      appJobs,
    });

    return reply.send({
      status: 'uninstalling',
      installId: job.installId,
      slug: job.slug,
    });
  });

  app.get('/apps/status', async (request, reply) => {
    const query = request.query as { installId?: string };
    const installId = query.installId?.trim();

    if (installId) {
      return reply.send({
        job: appJobs.get(installId) ?? null,
      });
    }

    const jobs = Array.from(appJobs.values()).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    return reply.send({ jobs });
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

type AppJobOperation = 'install' | 'uninstall';
type AppJobStatus = 'running' | 'succeeded' | 'failed';

interface AppJob {
  installId: string;
  slug: string;
  operation: AppJobOperation;
  status: AppJobStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  message: string | null;
}

interface AppStoreCallbackConfig {
  enabled?: boolean;
  callbackUrl?: string;
  callbackToken?: string;
  callbackTimeoutMs?: number;
}

function trackJob(appJobs: Map<string, AppJob>, maxTrackedJobs: number, job: AppJob): void {
  appJobs.set(job.installId, job);

  while (appJobs.size > maxTrackedJobs) {
    const oldestKey = appJobs.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    appJobs.delete(oldestKey);
  }
}

async function runAppOperation(input: {
  job: AppJob;
  script: string;
  callback?: AppStoreCallbackConfig;
  appJobs: Map<string, AppJob>;
}): Promise<void> {
  const { job, script, callback, appJobs } = input;
  const maxOutputChars = 8_000;
  let stdout = '';
  let stderr = '';

  const child = spawn('/bin/bash', ['-lc', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk: Buffer) => {
    stdout = appendLimited(stdout, chunk.toString('utf8'), maxOutputChars);
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderr = appendLimited(stderr, chunk.toString('utf8'), maxOutputChars);
  });

  const settled = await new Promise<{ exitCode: number; error: string | null }>((resolve) => {
    child.on('error', (error) => resolve({ exitCode: 1, error: error.message }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1, error: null }));
  });

  const success = settled.exitCode === 0;
  const message = summarizeOperationOutput({
    exitCode: settled.exitCode,
    error: settled.error,
    stdout,
    stderr,
  });

  const updated: AppJob = {
    ...job,
    status: success ? 'succeeded' : 'failed',
    finishedAt: new Date().toISOString(),
    exitCode: settled.exitCode,
    message: message || null,
  };
  appJobs.set(job.installId, updated);

  try {
    await sendAppInstallCallback({
      callback,
      installId: updated.installId,
      operation: updated.operation,
      status: success ? 'success' : 'failed',
      appSlug: updated.slug,
      message,
    });
  } catch (error) {
    logger.warn({ error, installId: updated.installId, operation: updated.operation }, 'App install callback failed');
  }
}

async function sendAppInstallCallback(input: {
  callback?: AppStoreCallbackConfig;
  installId: string;
  operation: AppJobOperation;
  status: 'success' | 'failed';
  appSlug: string;
  message?: string | null;
}): Promise<void> {
  if (input.callback?.enabled === false) {
    return;
  }

  const callbackUrl = input.callback?.callbackUrl?.trim();
  if (!callbackUrl) {
    logger.warn({ installId: input.installId }, 'App store callback URL is not configured; skipping callback');
    return;
  }

  const timeoutMs = input.callback?.callbackTimeoutMs && Number.isFinite(input.callback.callbackTimeoutMs)
    ? Math.max(2000, Math.min(input.callback.callbackTimeoutMs, 60000))
    : 10000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = input.callback?.callbackToken?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        installId: input.installId,
        operation: input.operation,
        status: input.status,
        appSlug: input.appSlug,
        message: input.message ?? null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function appendLimited(current: string, chunk: string, maxChars: number): string {
  if (!chunk) {
    return current;
  }

  const next = `${current}${chunk}`;
  if (next.length <= maxChars) {
    return next;
  }

  return next.slice(next.length - maxChars);
}

function summarizeOperationOutput(input: {
  exitCode: number;
  error: string | null;
  stdout: string;
  stderr: string;
}): string {
  if (input.error?.trim()) {
    return input.error.trim().slice(0, 1500);
  }

  const stderr = input.stderr.trim();
  if (stderr) {
    return stderr.slice(0, 1500);
  }

  const stdout = input.stdout.trim();
  if (stdout) {
    return stdout.slice(0, 1500);
  }

  return input.exitCode === 0 ? 'Completed successfully' : `Command failed with exit code ${input.exitCode}`;
}

if (require.main === module) {
  void startDaemon().catch((error) => {
    logger.error({ error }, 'Failed to start daemon');
    process.exit(1);
  });
}
