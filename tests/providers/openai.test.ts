import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenAIProvider } from '../../src/providers/openai';
import { ProviderError } from '../../src/utils/errors';

const mockState = vi.hoisted(() => ({
  create: vi.fn(),
  lastBaseUrl: '' as string | undefined,
}));

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockState.create,
        },
      };

      constructor(options: { baseURL?: string }) {
        mockState.lastBaseUrl = options.baseURL;
      }
    },
  };
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    mockState.create.mockReset();
    mockState.lastBaseUrl = undefined;
  });

  it('retries Gemini alias models with preview suffix after a 404', async () => {
    const notFoundError = Object.assign(new Error('404 status code (no body)'), { status: 404 });
    mockState.create
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'hello from gemini', tool_calls: [] } }],
        usage: { prompt_tokens: 2, completion_tokens: 4 },
      });

    const provider = new OpenAIProvider({
      apiKey: 'gem-key',
      apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-3-flash',
      providerName: 'gemini',
    });

    const result = await provider.complete([{ role: 'user', content: 'Hi' }]);

    expect(result.content).toBe('hello from gemini');
    expect(mockState.create).toHaveBeenCalledTimes(2);
    expect(mockState.create.mock.calls[0]?.[0]?.model).toBe('gemini-3-flash');
    expect(mockState.create.mock.calls[1]?.[0]?.model).toBe('gemini-3-flash-preview');
  });

  it('does not retry non-Gemini providers on 404', async () => {
    const notFoundError = Object.assign(new Error('404 status code (no body)'), { status: 404 });
    mockState.create.mockRejectedValueOnce(notFoundError);

    const provider = new OpenAIProvider({
      apiKey: 'openai-key',
      model: 'gpt-5.2',
      providerName: 'openai',
    });

    await expect(provider.complete([{ role: 'user', content: 'Hi' }])).rejects.toBeInstanceOf(ProviderError);
    expect(mockState.create).toHaveBeenCalledTimes(1);
  });

  it('labels errors with the configured provider name', async () => {
    mockState.create.mockRejectedValueOnce(new Error('request failed'));

    const provider = new OpenAIProvider({
      apiKey: 'gem-key',
      model: 'gemini-3-pro',
      providerName: 'gemini',
    });

    await expect(provider.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow('[gemini]');
  });
});
