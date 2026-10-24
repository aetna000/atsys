import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { applicationRoot, runtimeEntry, runtimeArgs } from '../runtime.js';
import type { ServiceStatus } from '../../shared/operations.js';
import { OperationsStore } from './store.js';
import { daemonHealthy } from './watchdog.js';
import { requireHookSupport } from './tasks.js';
import type { TaskConfig } from '../../shared/operations.js';
import { DomainError } from '../control-plane.js';
const root = applicationRoot;
const entry = runtimeEntry('daemon');
const args = runtimeArgs('daemon');
function identity(directory: string) {
  const label = `local.atsys.watchdog.${createHash('sha256').update(directory).digest('hex').slice(0, 10)}`;
  return {
    label,
    path: join(homedir(), 'Library/LaunchAgents', `${label}.plist`),
    target: `gui/${process.getuid?.() ?? 0}`,
  };
}
export function serviceStatus(directory: string): ServiceStatus {
  const i = identity(directory);
  let loaded = false;
  if (process.platform === 'darwin')
    try {
      execFileSync('launchctl', ['print', `${i.target}/${i.label}`], {
        stdio: 'ignore',
        timeout: 2000,
      });
      loaded = true;
    } catch {
      /* not loaded */
    }
  return {
    supported: process.platform === 'darwin',
    installed: existsSync(i.path),
    loaded,
    label: i.label,
    path: i.path,
    detail: loaded
      ? 'launchd restarts the watchdog and starts it at login.'
      : 'Detached watchdog survives terminal/API closure. Install the OS service for automatic watchdog restart.',
  };
}
export function ensureDaemon(store: OperationsStore) {
  if (daemonHealthy(store.read()) || serviceStatus(store.directory).loaded) return;
  const child = spawn(process.execPath, [...args, store.directory], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.on('error', () => {});
  child.unref();
}
export async function ensureHookSupport(store: OperationsStore, config: TaskConfig) {
  if (!config.hooks.length) return;
  ensureDaemon(store);
  for (let i = 0; i < 50 && !daemonHealthy(store.read()); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  requireHookSupport(store, config);
}
const xml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function installService(store: OperationsStore) {
  if (process.platform !== 'darwin')
    throw new DomainError(
      'Built-in service installation currently supports macOS launchd. Run the daemon under your OS service manager on other platforms.',
      400,
    );
  const i = identity(store.directory);
  if (serviceStatus(store.directory).loaded) return serviceStatus(store.directory);
  mkdirSync(dirname(i.path), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${xml(i.label)}</string><key>ProgramArguments</key><array>${[process.execPath, ...args, store.directory].map((v) => `<string>${xml(v)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin')}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string></dict></plist>`;
  writeFileSync(i.path, plist, { mode: 0o600 });
  const daemon = store.read().daemon;
  if (daemon) {
    try {
      const command = execFileSync('ps', ['-p', String(daemon.pid), '-o', 'command='], {
        encoding: 'utf8',
      });
      if (command.includes(entry) && command.includes(store.directory))
        process.kill(daemon.pid, 'SIGTERM');
    } catch {
      /* already exited */
    }
  }
  try {
    execFileSync('launchctl', ['bootstrap', i.target, i.path], { stdio: 'pipe', timeout: 10000 });
  } catch {
    throw new DomainError(
      'launchd bootstrap failed. Run service install from a logged-in macOS GUI session.',
      500,
    );
  }
  return serviceStatus(store.directory);
}
export function uninstallService(store: OperationsStore) {
  const i = identity(store.directory);
  if (process.platform !== 'darwin')
    throw new DomainError('macOS service manager unavailable', 400);
  try {
    execFileSync('launchctl', ['bootout', `${i.target}/${i.label}`], {
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch {
    /* not loaded */
  }
  if (existsSync(i.path)) unlinkSync(i.path);
  store.update((s) => {
    s.daemon = null;
  });
  ensureDaemon(store);
  return serviceStatus(store.directory);
}
