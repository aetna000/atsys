import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeArgs } from '../runtime.js';
import { portableNativeEvents, type AgentProvider } from '../../shared/providers.js';
import type { HookEvent, TaskConfig } from '../../shared/operations.js';
export const copilotNativeNames: Record<string, string> = {
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  UserPromptSubmit: 'userPromptSubmitted',
  Stop: 'agentStop',
  SessionStart: 'sessionStart',
  PreCompact: 'preCompact',
};
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
export function nativeEvent(provider: AgentProvider, name: string): HookEvent | undefined {
  const canonical =
    provider === 'copilot'
      ? Object.keys(copilotNativeNames).find((k) => copilotNativeNames[k] === name)
      : name;
  return portableNativeEvents[canonical as keyof typeof portableNativeEvents];
}
export function providerHookConfig(provider: 'claude' | 'copilot', c: Pick<TaskConfig, 'hooks'>) {
  const selected = c.hooks.filter((h) => h.events.some((e) => e.startsWith('agent_')));
  const hooks: Record<string, any[]> = {};
  function add(name: string, id: string, timeout: number, matcher?: string) {
    const event = provider === 'copilot' ? copilotNativeNames[name] : name;
    if (!event) return;
    const args = [...runtimeArgs('native-hook'), id, provider, event];
    (hooks[event] ??= []).push(
      provider === 'copilot'
        ? {
            type: 'command',
            exec: process.execPath,
            args,
            timeoutSec: timeout,
            ...(matcher ? { matcher } : {}),
          }
        : {
            ...(matcher ? { matcher } : {}),
            hooks: [
              {
                type: 'command',
                command: [process.execPath, ...args].map(quote).join(' '),
                timeout,
              },
            ],
          },
    );
  }
  if (selected.length) add('SessionStart', '__atsys_probe__', 5);
  for (const [name, event] of Object.entries(portableNativeEvents))
    for (const h of selected)
      if (h.events.includes(event))
        add(name, h.id, h.timeoutSeconds + 10, /ToolUse/.test(name) ? h.matcher : undefined);
  return provider === 'copilot' ? { version: 1, hooks } : { hooks };
}
export function providerHookArgs(provider: 'claude' | 'copilot', c: TaskConfig, directory: string) {
  const config = providerHookConfig(provider, c);
  if (!Object.keys(config.hooks).length) return [];
  if (provider === 'claude') return ['--settings', JSON.stringify(config)];
  const plugin = join(directory, 'copilot-atsys-bridge');
  for (const metadata of ['.github/plugin', '.claude-plugin']) {
    mkdirSync(join(plugin, metadata), { recursive: true, mode: 0o700 });
    writeFileSync(
      join(plugin, metadata, 'plugin.json'),
      JSON.stringify({
        name: 'atsys-bridge',
        version: '1.0.0',
        description: 'Managed AtSys native hook relay',
      }),
      { mode: 0o600 },
    );
  }
  writeFileSync(join(plugin, 'hooks.json'), JSON.stringify(config), { mode: 0o600 });
  return ['--plugin-dir', plugin];
}
