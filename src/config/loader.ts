import { promises as fs } from 'node:fs';
import path from 'node:path';

import { DEFAULT_CONFIG } from './defaults';
import { appConfigSchema, type AppConfig } from './schema';
import { ConfigError } from '../utils/errors';

function replaceEnvVars(input: string): string {
  return input.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => process.env[name] ?? '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(base: T, incoming: Record<string, unknown>): T {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const current = output[key];
    if (isRecord(current) && isRecord(value)) {
      output[key] = deepMerge(current, value);
    } else {
      output[key] = value;
    }
  }
  return output as T;
}

export async function loadConfig(configPath = './actions.config.json'): Promise<AppConfig> {
  const absolutePath = path.resolve(configPath);
  let loadedConfig: Record<string, unknown> = {};

  try {
    const file = await fs.readFile(absolutePath, 'utf8');
    loadedConfig = JSON.parse(replaceEnvVars(file)) as Record<string, unknown>;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw new ConfigError(`Failed to read config file at ${absolutePath}`, {
        cause: nodeError.message,
      });
    }
  }

  const merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, loadedConfig);
  const parsed = appConfigSchema.safeParse(merged);

  if (!parsed.success) {
    throw new ConfigError('Invalid configuration', {
      issues: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

export function mergeConfig(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  const merged = deepMerge(base as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  return appConfigSchema.parse(merged);
}
