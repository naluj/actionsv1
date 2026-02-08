import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface MemoryManager {
  store(input: string, response: string): Promise<void>;
  retrieve(query: string, limit?: number): Promise<MemoryEntry[]>;
  clear(): Promise<void>;
}

export class FileMemoryManager implements MemoryManager {
  constructor(
    private readonly memoryPath: string,
    private readonly maxEntries: number,
  ) {}

  async store(input: string, response: string): Promise<void> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      content: `User: ${input}\nAssistant: ${response}`,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    const existing = await this.loadMemory();
    existing.push(entry);

    if (existing.length > this.maxEntries) {
      existing.splice(0, existing.length - this.maxEntries);
    }

    await this.saveMemory(existing);
  }

  async retrieve(query: string, limit = 10): Promise<MemoryEntry[]> {
    const entries = await this.loadMemory();
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2);

    const scored = entries
      .map((entry) => ({
        entry,
        score: tokens.reduce((acc, token) => (entry.content.toLowerCase().includes(token) ? acc + 1 : acc), 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.timestamp.localeCompare(a.entry.timestamp))
      .slice(0, limit)
      .map((item) => item.entry);

    if (scored.length > 0) {
      return scored;
    }

    return entries.slice(-limit);
  }

  async clear(): Promise<void> {
    await this.saveMemory([]);
  }

  private async loadMemory(): Promise<MemoryEntry[]> {
    const absolutePath = path.resolve(this.memoryPath);

    try {
      const data = await fs.readFile(absolutePath, 'utf8');
      const parsed = JSON.parse(data) as MemoryEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async saveMemory(entries: MemoryEntry[]): Promise<void> {
    const absolutePath = path.resolve(this.memoryPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, JSON.stringify(entries, null, 2), 'utf8');
  }
}

export class DisabledMemoryManager implements MemoryManager {
  async store(): Promise<void> {
    return;
  }

  async retrieve(): Promise<MemoryEntry[]> {
    return [];
  }

  async clear(): Promise<void> {
    return;
  }
}
