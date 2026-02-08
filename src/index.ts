import { randomUUID } from 'node:crypto';

import { createAgent } from './agent/runner';
import { loadConfig } from './config/loader';
import { startDaemon } from './daemon/server';

export { createAgent, loadConfig, startDaemon };
export type {
  AgentType,
  AgentStatus,
  VMStatus,
  MessageRole,
  TaskType,
  TaskStatus,
  AgentRunInput,
  AgentRunResult,
  AgentStreamEvent,
} from './agent/types';

async function main(): Promise<void> {
  const config = await loadConfig('./actions.config.json');
  const agent = createAgent(config);

  const result = await agent.run({
    conversationId: randomUUID(),
    message: 'List files in the workspace using tools if needed.',
  });

  // Keep entrypoint output terse for embedding contexts.
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module && process.argv.includes('--run-once')) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
