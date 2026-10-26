import type { Attempt, TaskConfig } from './operations.js';
export const agentProviders = ['codex', 'copilot', 'claude'] as const;
export type AgentProvider = (typeof agentProviders)[number];
export const providerLabels: Record<AgentProvider, string> = {
  codex: 'Codex',
  copilot: 'GitHub Copilot',
  claude: 'Claude Code',
};
export function providerFor(c: TaskConfig, phase: Attempt['phase']): AgentProvider | undefined {
  const worker = c.worker === 'command' ? 'codex' : c.worker;
  if (phase === 'validator') return undefined;
  if (phase === 'supervisor') return c.supervisorProvider ?? worker;
  if (phase === 'repair') return c.repairProvider ?? c.supervisorProvider ?? worker;
  return c.worker === 'command' ? undefined : c.worker;
}
export const portableNativeEvents = {
  PreToolUse: 'agent_pre_tool',
  PostToolUse: 'agent_post_tool',
  UserPromptSubmit: 'agent_before_model_turn',
  Stop: 'agent_after_model_turn',
  SessionStart: 'agent_session_start',
  PreCompact: 'agent_pre_compact',
  PostCompact: 'agent_post_compact',
} as const;
export const providerCapabilities = agentProviders.map((id) => ({
  id,
  label: providerLabels[id],
  managedRoles: ['worker', 'supervisor', 'repair'],
  readOnlyDiagnosis: 'read/search tools only (Codex uses read-only sandbox)',
  executionIsolation:
    id === 'codex'
      ? 'Codex workspace-write sandbox'
      : 'Explicitly authorized local-user CLI tools; native permissions are not a Codex OS sandbox',
  nativePause: false,
  managedProcessPause: true,
  nativeSessionResume: false,
  modelHttpHooks: false,
  nativeEvents: Object.values(portableNativeEvents).filter(
    (event) => id !== 'copilot' || event !== 'agent_post_compact',
  ),
  limitations:
    id === 'copilot'
      ? [
          'No post-compaction event',
          'Before-turn command hooks cannot block; provider hook timeouts may fail open. AtSys still fences failed attempts.',
        ]
      : [],
}));
