export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export type ProviderMode = "local" | "remote";
export type PermissionMode = "ask" | "automatic";

export interface AppSettings {
  providerMode: ProviderMode;
  baseUrl: string;
  model: string;
  apiKey: string;
  permissionMode: PermissionMode;
  maxToolSteps: number;
  maxOutputTokens: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  providerMode: "local",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen3.5:4b",
  apiKey: "",
  permissionMode: "ask",
  maxToolSteps: 20,
  maxOutputTokens: 1_024,
};

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  message: ChatMessage;
}

export interface ToolApprovalRequest {
  id: string;
  tool: string;
  summary: string;
  args: Record<string, unknown>;
}

export interface ToolProgress {
  tool: string;
  summary: string;
}

export interface DesktopBridge {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  cancelChat(): Promise<boolean>;
  expand(pinned?: boolean): Promise<void>;
  collapse(): Promise<void>;
  close(): Promise<void>;
  approveTool(id: string, approved: boolean): Promise<void>;
  onApprovalRequest(listener: (request: ToolApprovalRequest) => void): () => void;
  onToolProgress(listener: (progress: ToolProgress) => void): () => void;
  onCaptureMode(listener: (active: boolean) => void): () => void;
  onApprovalShortcut(listener: (approved: boolean) => void): () => void;
}
