import type { z } from 'zod';

import type { ToolDefinition } from './types';

export type AnyTool = ToolDefinition<z.ZodTypeAny>;
