import { z } from 'zod';

const echoSchema = z.object({
  text: z.string(),
});

const echoTool = {
  name: 'echo',
  type: 'spawn',
  description: 'Echoes text back to the caller',
  parameters: echoSchema,
  requiresConsent: false,
  async execute(args: z.infer<typeof echoSchema>) {
    return { echoed: args.text };
  },
};

export default echoTool;
