import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileMemoryManager } from '../../src/agent/memory';

describe('FileMemoryManager', () => {
  it('stores and retrieves entries', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'actions-v1-memory-'));
    const memoryPath = path.join(dir, 'memory.json');
    const manager = new FileMemoryManager(memoryPath, 100);

    await manager.store('hello world', 'response one');
    await manager.store('weather tomorrow', 'response two');

    const results = await manager.retrieve('weather', 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.content).toContain('weather');

    const raw = await readFile(memoryPath, 'utf8');
    expect(JSON.parse(raw)).toHaveLength(2);
  });

  it('clears entries', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'actions-v1-memory-clear-'));
    const memoryPath = path.join(dir, 'memory.json');
    const manager = new FileMemoryManager(memoryPath, 100);

    await manager.store('foo', 'bar');
    await manager.clear();

    const results = await manager.retrieve('foo', 5);
    expect(results).toEqual([]);
  });
});
