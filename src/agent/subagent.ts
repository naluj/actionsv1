import { randomUUID } from 'node:crypto';

export type SubagentStatus = 'running' | 'completed' | 'failed';

export interface SubagentTaskRecord {
  id: string;
  task: string;
  status: SubagentStatus;
  createdAt: string;
  updatedAt: string;
  result?: Record<string, unknown>;
  error?: string;
}

export type SubagentWorker = (task: string) => Promise<Record<string, unknown>>;

export class SubagentManager {
  private readonly tasks = new Map<string, SubagentTaskRecord>();

  constructor(private readonly worker: SubagentWorker = defaultSubagentWorker) {}

  spawn(task: string): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: SubagentTaskRecord = {
      id,
      task,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(id, record);

    void this.worker(task)
      .then((result) => {
        this.tasks.set(id, {
          ...record,
          status: 'completed',
          result,
          updatedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        this.tasks.set(id, {
          ...record,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        });
      });

    return id;
  }

  async runInline(task: string): Promise<Record<string, unknown>> {
    return this.worker(task);
  }

  getTask(id: string): SubagentTaskRecord | undefined {
    return this.tasks.get(id);
  }

  listTasks(): SubagentTaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

async function defaultSubagentWorker(task: string): Promise<Record<string, unknown>> {
  return {
    summary: `Subagent completed: ${task}`,
  };
}
