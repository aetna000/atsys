export const hookEvents = [
  'before_run',
  'after_run',
  'on_run_error',
  'on_tick',
  'before_validation',
  'after_validation',
  'on_recovery',
  'on_task_complete',
  'on_task_stop',
  'on_escalation',
  'codex_pre_tool',
  'codex_post_tool',
  'codex_before_model_turn',
  'codex_after_model_turn',
  'codex_session_start',
  'codex_pre_compact',
  'codex_post_compact',
] as const;
export type HookEvent = (typeof hookEvents)[number];
export interface HookConfig {
  id: string;
  events: HookEvent[];
  argv: string[];
  phases: Attempt['phase'][];
  timeoutSeconds: number;
  intervalSeconds: number;
  maxInvocations: number;
  failurePolicy: 'fail' | 'continue';
  matcher: string;
}
export interface HookResult {
  message?: string;
  decision?: 'continue' | 'fail' | 'escalate';
  progress?: { completed: number; total: number; checkpoint?: string };
}
export interface HookContext {
  protocol: 'atsys-hook-v1';
  invocationId: string;
  event: HookEvent;
  occurredAt: string;
  task: {
    id: string;
    name: string;
    objective: string;
    cwd: string;
    status: TaskStatus;
    revision: number;
  };
  attempt: {
    id: string;
    phase: Attempt['phase'];
    status: Attempt['status'];
    startedAt: string;
    heartbeatAt: string;
    lastProgressAt: string;
    progress?: Attempt['progress'];
    failure?: string;
    output: string;
  } | null;
  native?: {
    provider: 'codex';
    event: string;
    model?: string;
    sessionId?: string;
    turnId?: string;
    toolName?: string;
    toolCallId?: string;
    toolInput?: unknown;
    toolResult?: unknown;
  };
}
export interface HookRun {
  id: string;
  key: string;
  hook: HookConfig;
  event: HookEvent;
  attemptId?: string;
  context: HookContext;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'interrupted';
  createdAt: string;
  startedAt?: string;
  heartbeatAt?: string;
  endedAt?: string;
  pid: number | null;
  result?: HookResult;
  error?: string;
  stderr?: string;
  applied?: boolean;
  cleanupConfirmed?: boolean;
}
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
  networkAccess: boolean;
  goalMonitoring: boolean;
  hooks: HookConfig[];
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
  lastObservedAt?: string;
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
  proposal?: {
    action: 'restart' | 'repair' | 'escalate';
    reason: string;
    instructions: string;
    blocker?: {
      kind: 'authorization' | 'resource' | 'external_dependency' | 'safety' | 'budget';
      evidence: string[];
      attemptedRemedies: string[];
      requiredResolution: string;
    } | null;
  };
  repairResult?: { fixed: boolean; summary: string };
  handled: boolean;
  cleanupConfirmed?: boolean;
  cleanupPendingAt?: string;
  hookGateRunIds?: string[];
  hookGatePassed?: boolean;
  hookProgressKeys?: string[];
  nativeHooksConnectedAt?: string;
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
  hookRuns?: HookRun[];
  hookCounts?: Record<string, number>;
  hookTickAt?: Record<string, string>;
  hookDeliveryKeys?: string[];
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
  daemon: {
    owner: string;
    pid: number;
    heartbeatAt: string;
    startedAt: string;
    hookProtocol?: 1;
  } | null;
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
  networkAccess: false,
  goalMonitoring: true,
  hooks: [],
};
