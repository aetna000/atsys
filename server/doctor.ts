import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Diagnostic } from '../shared/types.js';
const binaries = [
  ['codex', 'Codex', 'codex'],
  ['claude-code', 'Claude Code', 'claude'],
  ['copilot', 'GitHub Copilot', 'copilot'],
  ['grok', 'Grok Build', 'grok'],
  ['muse-code', 'Muse Code', 'muse'],
  ['atbot', 'AtBot', 'atbot'],
];
export function doctor(): Diagnostic[] {
  return binaries.map(([runtime, label, binary]) => {
    let found: string | null = null;
    for (const directory of (process.env.PATH ?? '').split(delimiter)) {
      try {
        const path = join(directory, binary);
        accessSync(path, constants.X_OK);
        found = path;
        break;
      } catch {
        /* executable absent */
      }
    }
    return {
      runtime,
      label,
      installed: !!found,
      implemented: runtime === 'codex',
      path: found,
      level: runtime === 'codex' ? 'Noninteractive exec' : 'Catalog only',
      capabilities: {
        logs: runtime === 'codex' && !!found,
        toolHooks: false,
        nativePause: false,
        nativeResume: false,
        steering: false,
        usage: false,
      },
      note:
        runtime === 'codex'
          ? found
            ? 'Codex exec worker, read-only supervisor and policy-authorized repair supported. Authentication has not been checked.'
            : 'Codex exec adapter available; install Codex on PATH.'
          : found
            ? 'Executable detected. Native AtSys adapter is not implemented; authentication and session capabilities have not been checked.'
            : 'Not found on PATH. Native AtSys adapter is not implemented.',
      checkedAt: new Date().toISOString(),
    };
  });
}
