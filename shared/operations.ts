export interface TaskConfig {
  name: string;
  objective: string;
  cwd: string;
  worker: 'command' | 'codex';
  argv: string[];
  resumeArgv: string[];
  model: string;
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh';
  validator: 'exit-code' | 'command' | 'benchmark-json';
  validationArgv: string[];
  validationTimeoutSeconds: number;
  requiredArtifacts: string[];
  activityTimeoutSeconds: number;
  plan: string;
  artifact: string;
  progressFile: string;
  timeoutSeconds: number;
  taskTimeoutSeconds: number;
  heartbeatTimeoutSeconds: number;
  progressTimeoutSeconds: number;
  recovery: 'notify' | 'restart' | 'supervised';
  maxRetries: number;
  backoffSeconds: number;
  supervisorModel: string;
  supervisorEffort: 'low' | 'medium' | 'high' | 'xhigh';
  supervisorTimeoutSeconds: number;
  maxSupervisorCalls: number;
  allowRepair: boolean;
  repairTimeoutSeconds: number;
}
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'recovering'
  | 'supervising'
  | 'repairing'
  | 'needs_attention'
  | 'completed'
  | 'stopped';
export interface TaskEvent {
  id: string;
  at: string;
  role: 'system' | 'worker' | 'observer' | 'supervisor' | 'policy';
  type: string;
  message: string;
}
export interface Attempt {
  id: string;
  phase: 'worker' | 'supervisor' | 'repair' | 'validator';
  status: 'starting' | 'running' | 'succeeded' | 'failed' | 'lost' | 'stopped';
  pid: number | null;
  startedAt: string;
  heartbeatAt: string;
  lastProgressAt: string;
  lastActivityAt?: string;
  endedAt?: string;
  exitCode?: number | null;
  failure?: string;
  output: string;
  config: TaskConfig;
  progress?: { completed: number; total: number; checkpoint?: string };
  validation?: {
    passed: boolean;
    detail: string;
    digest?: string;
    artifact?: string;
    artifacts?: { path: string; digest: string }[];
  };
  proposal?: { action: 'restart' | 'repair' | 'escalate'; reason: string; instructions: string };
  repairResult?: { fixed: boolean; summary: string };
  handled: boolean;
  cleanupConfirmed?: boolean;
}
export interface ManagedTask {
  id: string;
  config: TaskConfig;
  revision: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  stopRequested: boolean;
  attempts: Attempt[];
  events: TaskEvent[];
  attentionReason?: string;
}
export interface TelegramConfig {
  enabled: boolean;
  chatId: string;
  hasToken: boolean;
  onIncident: boolean;
  onRecovery: boolean;
  onCompletion: boolean;
  maxAttempts: number;
}
export interface Delivery {
  id: string;
  key: string;
  taskId: string;
  text: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  nextAt: string;
  createdAt: string;
  sentAt?: string;
  error?: string;
}
export interface OperationsState {
  version: 1;
  tasks: ManagedTask[];
  daemon: { owner: string; pid: number; heartbeatAt: string; startedAt: string } | null;
  telegram: TelegramConfig;
  deliveries: Delivery[];
}
export interface ServiceStatus {
  supported: boolean;
  installed: boolean;
  loaded: boolean;
  label: string;
  path: string;
  detail: string;
}
export interface OperationsView extends OperationsState {
  service: ServiceStatus;
  daemonHealthy: boolean;
}
export const taskDefaults: TaskConfig = {
  name: '',
  objective: '',
  cwd: '',
  worker: 'command',
  argv: [],
  resumeArgv: [],
  model: '',
  reasoningEffort: 'medium',
  validator: 'exit-code',
  validationArgv: [],
  validationTimeoutSeconds: 600,
  requiredArtifacts: [],
  activityTimeoutSeconds: 0,
  plan: '',
  artifact: '',
  progressFile: '',
  timeoutSeconds: 21600,
  taskTimeoutSeconds: 86400,
  heartbeatTimeoutSeconds: 15,
  progressTimeoutSeconds: 0,
  recovery: 'supervised',
  maxRetries: 2,
  backoffSeconds: 10,
  supervisorModel: '',
  supervisorEffort: 'high',
  supervisorTimeoutSeconds: 300,
  maxSupervisorCalls: 2,
  allowRepair: false,
  repairTimeoutSeconds: 600,
};
