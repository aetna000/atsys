export type Role = 'worker' | 'observer' | 'supervisor';
export type RunStatus =
  'running' | 'awaiting_approval' | 'completed' | 'failed' | 'aborted' | 'blocked';
export type Result =
  'not_evaluated' | 'validated_pass' | 'validated_fail' | 'incomplete' | 'aborted';
export type Severity = 'info' | 'warning' | 'critical';
export interface Capabilities {
  logs: boolean;
  toolHooks: boolean;
  nativePause: boolean;
  nativeResume: boolean;
  steering: boolean;
  usage: boolean;
}
export interface Project {
  id: string;
  name: string;
  path: string;
  branch: string;
  description: string;
  color: string;
  budget: number;
  createdAt: string;
  simulated: boolean;
}
export interface Agent {
  id: string;
  projectId: string;
  name: string;
  role: Role;
  runtime: string;
  model: string;
  status: 'healthy' | 'degraded' | 'idle' | 'unknown';
  capabilities: Capabilities;
  sessionId: string;
  lastHeartbeat: string;
  simulated: boolean;
}
export interface Run {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  command: string;
  runtime: string;
  adapter: 'simulator' | 'local-process';
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  progress: number | null;
  total: number | null;
  budget: number;
  timeoutSeconds: number;
  result: Result;
  validator: 'benchmark-json' | 'exit-code' | 'none';
  artifact?: string;
  validatorReceiptId?: string;
  attempts: number;
  checkpoint?: string;
  nativeSessionId: string;
}
export interface AgentEvent {
  id: string;
  schemaVersion: 1;
  runId: string;
  taskId: string;
  agentId: string;
  role: Role;
  runtime: string;
  nativeSessionId: string;
  type: string;
  severity: Severity;
  timestamp: string;
  message: string;
  evidenceIds: string[];
}
export interface Incident {
  id: string;
  runId: string;
  severity: Severity;
  category: string;
  title: string;
  diagnosis: string;
  status: 'open' | 'investigating' | 'acknowledged' | 'resolved';
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface Proposal {
  id: string;
  incidentId: string;
  runId: string;
  action: 'restart_checkpoint';
  target: string;
  parameters: { checkpoint: string };
  confidence: number;
  impact: string;
  rollback: string;
  verification: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedAt?: string;
  receiptId?: string;
}
export interface Evidence {
  id: string;
  runId: string;
  kind: 'log' | 'checkpoint' | 'artifact' | 'evaluation';
  title: string;
  content: string;
  digest: string;
  sourceDigest?: string;
  sourcePath?: string;
  createdAt: string;
  simulated: boolean;
}
export interface Receipt {
  id: string;
  runId: string;
  proposalId?: string;
  operation: string;
  outcome: string;
  detail: string;
  timestamp: string;
}
export interface Usage {
  id: string;
  invocationId: string;
  runId: string;
  runtime: string;
  model: string;
  role: Role;
  amount: number | null;
  inputTokens: number;
  outputTokens: number;
  source: string;
  pricingDate: string | null;
  timestamp: string;
  simulated: boolean;
}
export interface Settings {
  dailyBudget: number;
  retryLimit: number;
  staleAfterSeconds: number;
  recoveryMode: 'observe_only' | 'allowlisted';
  memoryMode: 'off';
  notifications: boolean;
}
export interface State {
  schemaVersion: 1;
  revision: number;
  projects: Project[];
  agents: Agent[];
  runs: Run[];
  events: AgentEvent[];
  incidents: Incident[];
  proposals: Proposal[];
  evidence: Evidence[];
  receipts: Receipt[];
  usage: Usage[];
  settings: Settings;
}
export interface Diagnostic {
  runtime: string;
  label: string;
  installed: boolean;
  implemented: boolean;
  path: string | null;
  level: string;
  capabilities: Capabilities;
  note: string;
  checkedAt: string;
}
export const RUNTIMES = [
  'codex',
  'claude-code',
  'copilot',
  'grok',
  'muse-code',
  'atbot',
  'custom',
] as const;
export const runtimeLabel = (runtime: string) =>
  ({
    codex: 'Codex',
    'claude-code': 'Claude Code',
    copilot: 'GitHub Copilot',
    grok: 'Grok Build',
    'muse-code': 'Muse Code',
    atbot: 'AtBot',
    custom: 'Custom agent',
    deterministic: 'Rule engine',
    'local-process': 'Local process',
  })[runtime] ?? runtime;
export const TERMINAL: RunStatus[] = ['completed', 'failed', 'aborted', 'blocked'];
