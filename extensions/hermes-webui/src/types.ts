export type ToolLifecycle =
  | "running"
  | "complete"
  | "error"
  | "cancelled"
  | "approval"
  | "malformed";

export type HostTranscriptPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "reasoning"; readonly id: string; readonly text: string }
  | {
      readonly type: "tool";
      readonly id: string;
      readonly name: string | null;
      readonly args: unknown;
      readonly status: ToolLifecycle;
      readonly result?: unknown;
    }
  | { readonly type: "error"; readonly id: string; readonly text: string; readonly status?: "error" | "cancelled" };

export interface HostTranscriptMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly parts: readonly HostTranscriptPart[];
  readonly createdAt?: number;
  readonly isLive?: boolean;
}

export interface HostTranscriptSnapshot {
  readonly sessionId: string | null;
  readonly isRunning: boolean;
  readonly messages: readonly HostTranscriptMessage[];
}

export interface HostTranscriptStore {
  getSnapshot(): HostTranscriptSnapshot;
  subscribe(listener: () => void): () => void;
}

declare global {
  interface Window {
    HermesTranscriptStore?: HostTranscriptStore;
    HermesAssistantUiRenderer?: {
      mount(): boolean;
      unmount(): void;
      isMounted(): boolean;
    };
  }
}
