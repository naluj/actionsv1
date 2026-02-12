import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Logger } from 'pino';

import { OpenAIProvider } from '../providers/openai';
import { AnthropicProvider } from '../providers/anthropic';
import { OllamaProvider } from '../providers/ollama';
import type { LLMProvider, ProviderMessage } from '../providers/types';
import type { AppConfig } from '../config/schema';
import { mergeConfig } from '../config/loader';
import { logger as defaultLogger } from '../utils/logger';
import { StateManager } from './state';
import { FileMemoryManager, DisabledMemoryManager, type MemoryManager } from './memory';
import { ToolRegistry } from '../tools/registry';
import { fileTool } from '../tools/file';
import { shellTool } from '../tools/shell';
import { browserTool } from '../tools/browser';
import { spawnTool } from '../tools/spawn';
import type { AnyTool } from '../tools/base';
import { AutoApproveConsent, type ConsentHandler } from '../security/consent';
import { AuditLogger } from '../security/audit';
import { SubagentManager } from './subagent';
import { SkillsLoader } from './skills';
import { ToolExecutor } from './executor';
import { runAgentLoop, runAgentLoopStream } from './loop';
import type { AgentRunInput, AgentRunResult, AgentStatus } from './types';

interface CreateAgentOptions {
  logger?: Logger;
  provider?: LLMProvider;
  consentHandler?: ConsentHandler;
}

class NoopProvider implements LLMProvider {
  readonly name = 'noop';
  readonly supportsFunctions = false;

  async complete(_messages: ProviderMessage[]): Promise<{ content: string }> {
    return {
      content: 'Provider is not configured. Please set API credentials in config.',
    };
  }
}

export class ActionsAgent {
  readonly id = randomUUID();
  private status: AgentStatus = 'initializing';

  private provider: LLMProvider;
  private config: AppConfig;

  private readonly logger: Logger;
  private readonly state = new StateManager();
  private readonly memory: MemoryManager;
  private readonly tools = new ToolRegistry();
  private readonly auditLogger: AuditLogger;
  private readonly subagentManager = new SubagentManager();
  private readonly consentHandler: ConsentHandler;

  constructor(config: AppConfig, options: CreateAgentOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
    this.config = config;
    this.provider = options.provider ?? this.createProvider(config);
    this.memory = config.memory.enabled
      ? new FileMemoryManager(config.memory.path, config.memory.maxEntries)
      : new DisabledMemoryManager();
    this.auditLogger = new AuditLogger(config.audit.enabled, config.audit.path);
    this.consentHandler = options.consentHandler ?? new AutoApproveConsent();

    this.registerBuiltInTools(config);
    this.status = 'ready';
  }

  private registerBuiltInTools(config: AppConfig): void {
    const toolMap: Record<string, AnyTool> = {
      file: fileTool,
      shell: shellTool,
      browser: browserTool,
      spawn: spawnTool,
    };

    for (const toolName of config.tools.enabledTools) {
      const tool = toolMap[toolName];
      if (tool) {
        this.tools.register(tool);
      }
    }
  }

  async loadSkills(skillsDir = path.resolve(process.cwd(), 'skills')): Promise<void> {
    const loader = new SkillsLoader(skillsDir);
    const loadedTools = await loader.loadTools();
    for (const tool of loadedTools) {
      this.tools.register(tool);
    }
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    this.status = 'busy';
    const executor = this.createExecutor();

    try {
      const result = await runAgentLoop(input, {
        logger: this.logger,
        provider: this.provider,
        tools: this.tools,
        memory: this.memory,
        state: this.state,
        executor,
        maxIterations: this.config.agent.maxIterations,
        temperature: this.config.agent.temperature,
        maxTokens: this.config.agent.maxTokens,
        systemPrompt: this.config.agent.systemPrompt,
        memoryRetrievalLimit: this.config.memory.retrievalLimit,
      });
      this.status = 'ready';
      return result;
    } catch (error) {
      this.status = 'error';
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Agent run failed');
      throw error;
    }
  }

  async *runStream(input: AgentRunInput) {
    this.status = 'busy';
    const executor = this.createExecutor();

    try {
      const stream = runAgentLoopStream(input, {
        logger: this.logger,
        provider: this.provider,
        tools: this.tools,
        memory: this.memory,
        state: this.state,
        executor,
        maxIterations: this.config.agent.maxIterations,
        temperature: this.config.agent.temperature,
        maxTokens: this.config.agent.maxTokens,
        systemPrompt: this.config.agent.systemPrompt,
        memoryRetrievalLimit: this.config.memory.retrievalLimit,
      });

      for await (const event of stream) {
        yield event;
      }

      this.status = 'ready';
    } catch (error) {
      this.status = 'error';
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Agent loop failed');
      throw error;
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getVersion(): string {
    return '1.0.0';
  }

  getConversationMessages(conversationId: string) {
    return this.state.getConversationMessages(conversationId);
  }

  listTasks() {
    return this.state.listTasks();
  }

  getTask(taskId: string) {
    return this.state.getTask(taskId);
  }

  updateConfig(patch: Partial<AppConfig>): AppConfig {
    this.config = mergeConfig(this.config, patch);
    this.provider = this.createProvider(this.config);
    return this.config;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  private createExecutor(): ToolExecutor {
    return new ToolExecutor({
      agentId: this.id,
      logger: this.logger,
      state: this.state,
      registry: this.tools,
      consentHandler: this.consentHandler,
      auditLogger: this.auditLogger,
      runtimeContext: {
        workspaceRoot: path.resolve(this.config.tools.workspaceRoot),
        sandboxConfig: {
          workspaceRoot: path.resolve(this.config.tools.workspaceRoot),
          restrictToWorkspace: this.config.tools.restrictToWorkspace,
          blockedCommands: this.config.tools.blockedCommands,
          blockedPaths: this.config.tools.blockedPaths,
        },
        commandTimeoutMs: this.config.tools.commandTimeoutMs,
        logger: this.logger,
        subagentManager: this.subagentManager,
      },
    });
  }

  private createProvider(config: AppConfig): LLMProvider {
    const provider = config.agent.provider;

    if (provider === 'openai') {
      if (!config.providers.openai) {
        return new NoopProvider();
      }
      return new OpenAIProvider({
        apiKey: config.providers.openai.apiKey,
        apiBase: config.providers.openai.apiBase,
        model: config.providers.openai.model,
        providerName: 'openai',
      });
    }

    if (provider === 'anthropic') {
      if (!config.providers.anthropic) {
        return new NoopProvider();
      }
      return new AnthropicProvider({
        apiKey: config.providers.anthropic.apiKey,
        apiBase: config.providers.anthropic.apiBase,
        model: config.providers.anthropic.model,
      });
    }

    if (provider === 'gemini') {
      if (!config.providers.gemini) {
        return new NoopProvider();
      }
      return new OpenAIProvider({
        apiKey: config.providers.gemini.apiKey,
        apiBase: config.providers.gemini.apiBase,
        model: config.providers.gemini.model,
        providerName: 'gemini',
      });
    }

    if (provider === 'kimi') {
      if (!config.providers.kimi) {
        return new NoopProvider();
      }
      return new OpenAIProvider({
        apiKey: config.providers.kimi.apiKey,
        apiBase: config.providers.kimi.apiBase,
        model: config.providers.kimi.model,
        providerName: 'kimi',
      });
    }

    const ollama = config.providers.ollama;
    if (!ollama) {
      return new NoopProvider();
    }

    return new OllamaProvider({
      model: ollama.model,
      apiBase: ollama.apiBase,
    });
  }
}

export function createAgent(config: AppConfig, options?: CreateAgentOptions): ActionsAgent {
  return new ActionsAgent(config, options);
}
