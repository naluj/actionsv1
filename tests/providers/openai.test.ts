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

  it('retries Gemini in compatibility mode without tools after a 400', async () => {
    const badRequestError = Object.assign(new Error('400 status code (no body)'), { status: 400 });
    mockState.create
      .mockRejectedValueOnce(badRequestError)
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

    const result = await provider.complete(
      [{ role: 'user', content: 'Hi' }],
      {
        tools: [
          {
            name: 'echo_tool',
            description: 'Echo text',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        ],
      },
    );

    expect(result.content).toBe('hello from gemini');
    expect(mockState.create).toHaveBeenCalledTimes(2);
    expect(mockState.create.mock.calls[0]?.[0]?.model).toBe('gemini-3-flash');
    expect(mockState.create.mock.calls[0]?.[0]?.tools).toBeDefined();
    expect(mockState.create.mock.calls[1]?.[0]?.model).toBe('gemini-3-flash');
    expect(mockState.create.mock.calls[1]?.[0]?.tools).toBeUndefined();
  });

  it('falls back to preview model after compatibility retries are exhausted', async () => {
    const notFoundError = Object.assign(new Error('404 status code (no body)'), { status: 404 });
    mockState.create
      .mockRejectedValueOnce(notFoundError)
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'fallback model worked', tool_calls: [] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });

    const provider = new OpenAIProvider({
      apiKey: 'gem-key',
      apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-3-flash',
      providerName: 'gemini',
    });

    const result = await provider.complete([{ role: 'user', content: 'Hi' }]);

    expect(result.content).toBe('fallback model worked');
    expect(mockState.create).toHaveBeenCalledTimes(3);
    expect(mockState.create.mock.calls[0]?.[0]?.model).toBe('gemini-3-flash');
    expect(mockState.create.mock.calls[1]?.[0]?.model).toBe('gemini-3-flash');
    expect(mockState.create.mock.calls[2]?.[0]?.model).toBe('gemini-3-flash-preview');
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
