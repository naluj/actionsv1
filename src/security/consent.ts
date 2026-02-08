import type { ToolCall } from '../agent/types';

export interface ConsentHandler {
  requestConsent(toolCall: ToolCall): Promise<boolean>;
}

export class AutoApproveConsent implements ConsentHandler {
  async requestConsent(): Promise<boolean> {
    return true;
  }
}

export class CallbackConsent implements ConsentHandler {
  constructor(private readonly callback: (call: ToolCall) => Promise<boolean>) {}

  async requestConsent(toolCall: ToolCall): Promise<boolean> {
    return this.callback(toolCall);
  }
}
