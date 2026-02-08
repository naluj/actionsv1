import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface AuditEvent {
  timestamp: string;
  action: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  constructor(private readonly enabled: boolean, private readonly logPath: string) {}

  async log(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const entry: AuditEvent = {
      timestamp: new Date().toISOString(),
      ...event,
    };

    const absolutePath = path.resolve(this.logPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.appendFile(absolutePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }
}
