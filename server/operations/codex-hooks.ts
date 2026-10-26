import { portableNativeEvents } from '../../shared/providers.js';
import { runtimeArgs } from '../runtime.js';
import type { HookEvent, TaskConfig } from '../../shared/operations.js';
export const nativeEvents: Record<string, HookEvent> = {
  PreToolUse: 'codex_pre_tool',
  PostToolUse: 'codex_post_tool',
  UserPromptSubmit: 'codex_before_model_turn',
  Stop: 'codex_after_model_turn',
  SessionStart: 'codex_session_start',
  PreCompact: 'codex_pre_compact',
  PostCompact: 'codex_post_compact',
};
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
export function codexHookConfig(config: Pick<TaskConfig, 'hooks'>) {
  const nativeHooks = config.hooks.filter((h) =>
    h.events.some((e) => e.startsWith('codex_') || e.startsWith('agent_')),
  );
  const hooks: Record<
    string,
    {
      matcher?: string;
      hooks: { type: 'command'; command: string; timeout: number; statusMessage: string }[];
    }[]
  > = {};
  const command = (id: string) =>
    [process.execPath, ...runtimeArgs('native-hook'), id].map(quote).join(' ');
  if (nativeHooks.length)
    hooks.SessionStart = [
      {
        hooks: [
          {
            type: 'command',
            command: command('__atsys_probe__'),
            timeout: 5,
            statusMessage: 'Connect AtSys hook receipts',
          },
        ],
      },
    ];
  for (const [name, event] of Object.entries(nativeEvents))
    for (const hook of nativeHooks) {
      if (
        !hook.events.includes(event) &&
        !hook.events.includes(portableNativeEvents[name as keyof typeof portableNativeEvents])
      )
        continue;
      (hooks[name] ??= []).push({
        ...(name === 'PreToolUse' || name === 'PostToolUse' ? { matcher: hook.matcher } : {}),
        hooks: [
          {
            type: 'command',
            command: command(hook.id),
            timeout: hook.timeoutSeconds + 10,
            statusMessage: `AtSys: ${hook.id}`,
          },
        ],
      });
    }
  return { hooks };
}
// TOML inline values preserve argv boundaries; no shell is used for Codex itself.
function toml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toml).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .map(([k, v]) => `${JSON.stringify(k)}=${toml(v)}`)
      .join(',')}}`;
  return String(value);
}
export function codexHookArgs(config: TaskConfig): string[] {
  return Object.entries(codexHookConfig(config).hooks).flatMap(([event, groups]) => [
    '-c',
    `hooks.${event}=${toml(groups)}`,
  ]);
}
