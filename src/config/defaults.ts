import type { AppConfig } from './schema';

export const DEFAULT_CONFIG: AppConfig = {
  providers: {
    ollama: {
      apiBase: 'http://localhost:11434',
      model: 'llama3.1',
    },
  },
  agent: {
    provider: 'ollama',
    model: 'llama3.1',
    maxIterations: 10,
    temperature: 0.7,
    systemPrompt: 'You are a helpful AI assistant with access to tools.',
  },
  tools: {
    restrictToWorkspace: true,
    workspaceRoot: './workspace',
    blockedCommands: ['(^|\\s)sudo(\\s|$)', 'rm\\s+-rf\\s+/', 'shutdown', 'reboot'],
    blockedPaths: ['.git', '.env'],
    enabledTools: ['file', 'shell', 'browser', 'spawn'],
    commandTimeoutMs: 30000,
  },
  memory: {
    enabled: true,
    path: './memory.json',
    maxEntries: 1000,
    retrievalLimit: 10,
  },
  daemon: {
    host: '0.0.0.0',
    port: 3000,
  },
  audit: {
    enabled: true,
    path: './audit.log',
  },
};
