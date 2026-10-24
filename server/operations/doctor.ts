import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import type { TaskConfig } from '../../shared/operations.js';
import { inside } from './config.js';

export interface SetupReport {
  ready: boolean;
  checkedAt: string;
  checks: { name: string; passed: boolean; detail: string }[];
  repairs: string[];
}

// Only executable presence is tested. Never execute a user's workload as a probe.
export function executableAvailable(command: string, cwd: string) {
  const candidates =
    isAbsolute(command) || command.includes('/')
      ? [resolve(cwd, command)]
      : (process.env.PATH ?? '').split(delimiter).map((p) => join(p || cwd, command));
  return candidates.some((path) => {
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

export function setupDoctor(cwd: string, config?: TaskConfig): SetupReport {
  const report: SetupReport = {
    ready: true,
    checkedAt: new Date().toISOString(),
    checks: [],
    repairs: [],
  };
  const check = (name: string, run: () => string) => {
    try {
      report.checks.push({ name, passed: true, detail: run() });
    } catch (e) {
      report.ready = false;
      report.checks.push({
        name,
        passed: false,
        detail: e instanceof Error ? e.message : 'Check failed',
      });
    }
  };
  check('workspace', () => {
    accessSync(cwd, constants.R_OK | constants.W_OK | constants.X_OK);
    if (!statSync(cwd).isDirectory()) throw new Error('Workspace is not a directory');
    return 'Workspace is accessible and writable';
  });
  check('disk', () => {
    const s = statfsSync(cwd);
    const free = s.bavail * s.bsize;
    if (free < 64 * 1024 * 1024)
      throw new Error(
        `Only ${free} bytes available; minimum setup reserve is 64 MiB. No files were deleted.`,
      );
    return `${free} available bytes; workload-specific disk requirements remain the worker's responsibility`;
  });
  check('write-read-pilot', () => {
    const dir = join(cwd, '.atsys');
    const existing = existsSync(dir);
    if (!inside(realpathSync(cwd), realpathSync(existing ? dir : dirname(dir))))
      throw new Error('AtSys setup directory resolves outside the workspace');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!existing) report.repairs.push('Created missing task-local .atsys directory');
    const probe = mkdtempSync(join(dir, 'doctor-pilot-'));
    try {
      const path = join(probe, 'probe.json');
      const value = JSON.stringify({ doctor: true, checkedAt: report.checkedAt });
      writeFileSync(path, value, { flag: 'wx', mode: 0o600 });
      if (readFileSync(path, 'utf8') !== value) throw new Error('Setup write/read pilot mismatch');
      return 'Private write/read/delete pilot passed; project files untouched';
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
  });
  if (config) {
    const required = [
      { name: 'worker executable', command: config.worker === 'codex' ? 'codex' : config.argv[0] },
      ...(config.validator === 'command'
        ? [{ name: 'validator executable', command: config.validationArgv[0] }]
        : []),
      ...(config.recovery === 'supervised'
        ? [{ name: 'supervisor executable', command: 'codex' }]
        : []),
      ...(config.worker === 'command' && config.resumeArgv.length
        ? [{ name: 'resume executable', command: config.resumeArgv[0] }]
        : []),
    ];
    for (const item of required)
      check(item.name, () => {
        if (!item.command || !executableAvailable(item.command, cwd))
          throw new Error(`${item.name} is unavailable on the service PATH`);
        return 'Executable located; authentication and external service access are not inferred';
      });
  }
  return report;
}
