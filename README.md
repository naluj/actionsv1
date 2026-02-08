# Actions V1

TypeScript bot core and VM daemon for the Actions platform.

## Features

- Agent loop with tool-calling orchestration
- File, shell, browser, and spawn tools
- OpenAI, Anthropic, and Ollama providers
- Persistent memory and conversation/task state
- Security layer (sandbox, consent, audit)
- Fastify daemon API on port `3000`

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run daemon
```

## API Endpoints

- `GET /health`
- `POST /chat` (SSE)
- `GET /conversations/:id/messages`
- `GET /tasks`
- `GET /tasks/:id`
- `PUT /config`
