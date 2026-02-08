import { describe, expect, it } from 'vitest';

import { assertCommandAllowed, assertWithinWorkspace, resolvePathInsideWorkspace } from '../../src/security/sandbox';

describe('sandbox', () => {
  const config = {
    workspaceRoot: '/tmp/workspace',
    restrictToWorkspace: true,
    blockedCommands: ['sudo', 'rm\\s+-rf\\s+/'],
    blockedPaths: ['.env'],
  };

  it('allows safe paths and blocks escapes', () => {
    const resolved = resolvePathInsideWorkspace('subdir/file.txt', config);
    expect(resolved.startsWith('/tmp/workspace')).toBe(true);

    expect(() => assertWithinWorkspace('../outside.txt', config)).toThrow('outside workspace');
  });

  it('blocks banned commands', () => {
    expect(() => assertCommandAllowed('echo ok', config)).not.toThrow();
    expect(() => assertCommandAllowed('sudo ls', config)).toThrow('blocked');
  });
});
