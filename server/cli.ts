import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationRoot } from './runtime.js';
import { codexHookConfig } from './operations/codex-hooks.js';
import { execFileSync } from 'node:child_process';
import { Store } from './store.js';
import { ControlPlane } from './control-plane.js';
import { doctor } from './doctor.js';
import { setupDoctor } from './operations/doctor.js';
import { executeProcess } from './process-adapter.js';
import { OperationsStore } from './operations/store.js';
import { verifyReport } from './operations/reports.js';
import { createTask, changeTask, generateRetrospectiveReport } from './operations/tasks.js';
import { withDefaults } from './operations/config.js';
import { selectTask, watchTask } from './operations/monitor.js';
import {
  formatTaskStatus,
  readableTaskLog,
  readableMessage,
  taskLogEntries,
  taskPresentation,
} from '../shared/task-presentation.js';
import {
  ensureDaemon,
  ensureHookSupport,
  installService,
  uninstallService,
  serviceStatus,
} from './operations/service.js';
const root = applicationRoot;
const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const separator = args.indexOf('--');
const optionArgs = separator < 0 ? args : args.slice(0, separator);
const value = (flag: string) => {
  const i = optionArgs.indexOf(flag);
  return i >= 0 ? optionArgs[i + 1] : undefined;
};
const dataDir = resolve(process.env.ATSYS_DATA_DIR ?? resolve(root, '.atsys'));
try {
  if (command === 'help' || optionArgs.includes('--help')) {
    console.log(`AtSys — durable task supervision

  atsys task submit --config task.json       Submit durable task and exit
  atsys task submit --project /repo --name build -- command arg ...
  atsys task list | show <id> | stop <id> | retry <id>
  atsys task status [id] [--json]            Readable current task and next action
  atsys task watch [id] [--once]             Quiet live monitor; Ctrl+C does not stop work
  atsys task report [id] [--json] [--generate] [--outcome-file relative.json]
                                             Read/verify or attach a retrospective report
  atsys task logs [id] [--raw]               Readable worker messages (raw is opt-in)
  atsys service install | status | start | uninstall
                                             OS watchdog lifecycle (macOS launchd)

  atsys init [--project /absolute/repo]       Write opt-in .atsys/project.json only
  atsys doctor [--project /repo] [--config task.json]
                                             Setup/write pilot and executable checks; no credentials
  atsys dashboard                           Print local console address
  atsys status                              Print durable run status
  atsys run --project /repo [options] -- command arg ...
  atsys run --worker codex --project /repo --objective "Implement feature" --validation '["npm","test"]'
  atsys stop <run-id>                        Persist controlled stop request
  atsys uninstall [--project /repo]          Detach config; preserve history and source

Run options:
  --timeout <seconds>                        Default 3600; maximum 86400
  --validator exit-code                     Explicit zero-exit completion check
  --validator benchmark-json --artifact results.json
                                            Require complete cases, passed=true, accuracy ≥ 0.80

Without a declared validator a successful exit is incomplete.
Use task submit for unattended work. Only run --attached uses the legacy terminal-owned executor.
Codex supervision uses codex exec with read-only diagnosis and optional bounded repair.
Data directory: ${dataDir}
Start console from the AtSys repository: npm run dev (development) or npm run build && npm start.`);
  } else if (command === 'hooks' && args[1] === 'codex-config') {
    const file = value('--config');
    if (!file) throw new Error('Use hooks codex-config --config task.json');
    console.log(
      JSON.stringify(
        codexHookConfig(withDefaults(JSON.parse(readFileSync(resolve(file), 'utf8')))),
        null,
        2,
      ),
    );
  } else if (
    command === 'task' ||
    command === 'service' ||
    (command === 'run' && !optionArgs.includes('--attached'))
  ) {
    const ops = new OperationsStore(dataDir);
    try {
      if (command === 'service') {
        const action = args[1] ?? 'status';
        if (action === 'install') console.log(JSON.stringify(installService(ops), null, 2));
        else if (action === 'uninstall')
          console.log(JSON.stringify(uninstallService(ops), null, 2));
        else if (action === 'start') {
          ensureDaemon(ops);
          console.log('Detached watchdog requested.');
        } else
          console.log(
            JSON.stringify({ service: serviceStatus(dataDir), daemon: ops.read().daemon }, null, 2),
          );
      } else {
        const action = command === 'run' ? 'submit' : (args[1] ?? 'list');
        if (action === 'list') {
          const tasks = ops
            .read()
            .tasks.filter(
              (task) =>
                !optionArgs.includes('--active') ||
                [
                  'queued',
                  'running',
                  'recovering',
                  'supervising',
                  'repairing',
                  'pausing',
                  'paused',
                  'resuming',
                ].includes(task.status),
            );
          if (optionArgs.includes('--json'))
            console.log(JSON.stringify(tasks.map(taskPresentation)));
          else
            console.table(
              tasks.map((t) => ({
                id: t.id,
                name: t.config.name,
                status: t.status,
                goal: t.config.objective,
                stage: taskPresentation(t).progress?.checkpoint ?? 'Unknown',
                report: t.reportError ?? t.reports?.at(-1)?.id ?? 'Pending / legacy',
                attempts: t.attempts.length,
                updated: t.updatedAt,
              })),
            );
        } else if (action === 'report') {
          const task = selectTask(
            ops.read().tasks,
            args[2]?.startsWith('--') ? undefined : args[2],
          );
          if (value('--outcome-file') && !optionArgs.includes('--generate'))
            throw new Error('--outcome-file requires --generate');
          const report = optionArgs.includes('--generate')
            ? generateRetrospectiveReport(ops, task.id, value('--outcome-file'))
            : task.reports?.at(-1);
          if (!report || 'error' in report)
            throw new Error(
              report && 'error' in report
                ? report.error
                : (task.reportError ??
                    'No durable report. Use --generate for a terminal legacy task.'),
            );
          verifyReport(ops.directory, report);
          console.log(
            optionArgs.includes('--json')
              ? JSON.stringify(report, null, 2)
              : report.markdown + '\n\nReport SHA-256: ' + report.digest,
          );
        } else if (['status', 'watch', 'logs'].includes(action)) {
          const id = args[2]?.startsWith('--') ? undefined : args[2];
          const task = selectTask(ops.read().tasks, id);
          const dashboard = 'http://127.0.0.1:' + (process.env.ATSYS_PORT ?? 4310);
          if (action === 'watch')
            await watchTask(ops, task.id, {
              interval: Number(value('--interval') ?? 2),
              once: optionArgs.includes('--once'),
              dashboard,
            });
          else if (action === 'status')
            console.log(
              optionArgs.includes('--json')
                ? JSON.stringify(
                    {
                      ...taskPresentation(task),
                      ...(optionArgs.includes('--activity')
                        ? {
                            activity: taskLogEntries(task, 100),
                            timeline: task.events.slice(0, 100).map((event) => ({
                              ...event,
                              message: readableMessage(event.message, 600),
                            })),
                            hooks: (task.hookRuns ?? [])
                              .slice(-30)
                              .reverse()
                              .map((run) => ({
                                id: run.id,
                                name: run.hook.id,
                                event: run.event,
                                status: run.status,
                                message: run.error ?? run.result?.message ?? '',
                                decision: run.result?.decision,
                                model: run.context.native?.model,
                                tool: run.context.native?.toolName,
                              })),
                          }
                        : {}),
                    },
                    null,
                    2,
                  )
                : formatTaskStatus(task, process.stdout.columns || 88, Date.now(), dashboard),
            );
          else {
            const attempt = task.attempts.findLast((a) => a.phase === 'worker');
            console.log(
              attempt
                ? optionArgs.includes('--raw')
                  ? attempt.output
                  : readableTaskLog(task, Number(value('--lines') ?? 12))
                : 'Worker has not started.',
            );
          }
        } else if (action === 'show')
          console.log(
            JSON.stringify(ops.read().tasks.find((t) => t.id === args[2]) ?? null, null, 2),
          );
        else if (['stop', 'retry', 'pause', 'resume'].includes(action)) {
          if (action === 'retry') {
            const task = ops.read().tasks.find((t) => t.id === args[2]);
            if (task) await ensureHookSupport(ops, task.config);
          }
          console.log(
            JSON.stringify(
              changeTask(
                ops,
                selectTask(ops.read().tasks, args[2]).id,
                action as 'stop' | 'retry' | 'pause' | 'resume',
              ),
              null,
              2,
            ),
          );
          ensureDaemon(ops);
        } else if (action === 'submit') {
          const file = value('--config');
          const config = file
            ? withDefaults(JSON.parse(readFileSync(resolve(file), 'utf8')))
            : withDefaults({
                name: value('--name') ?? 'Managed local task',
                objective:
                  value('--objective') ?? 'Execute the declared command and validate completion.',
                cwd: value('--project') ?? process.cwd(),
                worker: (value('--worker') ?? 'command') as 'command' | 'codex',
                model: value('--model') ?? '',
                argv: separator >= 0 ? args.slice(separator + 1) : [],
                validationArgv: JSON.parse(value('--validation') ?? '[]'),
                validator: (value('--validator') ??
                  (value('--validation') ? 'command' : 'exit-code')) as
                  'exit-code' | 'command' | 'benchmark-json',
                artifact: value('--artifact') ?? '',
                recovery: (value('--recovery') ?? 'supervised') as
                  'notify' | 'restart' | 'supervised',
                timeoutSeconds: Number(value('--timeout') ?? 21600),
              });
          await ensureHookSupport(ops, config);
          const task = createTask(ops, config);
          ensureDaemon(ops);
          console.log(
            JSON.stringify(
              {
                id: task.id,
                status: task.status,
                dashboard:
                  'http://127.0.0.1:' + (process.env.ATSYS_PORT ?? 4310) + '/tasks/' + task.id,
                message:
                  'Task persisted. Execution belongs to the watchdog; this command may exit.',
              },
              null,
              2,
            ),
          );
        } else throw new Error('Use task status, watch, logs, submit, list, show, stop, or retry');
      }
    } finally {
      ops.close();
    }
  } else if (command === 'doctor') {
    const file = value('--config');
    const config = file ? withDefaults(JSON.parse(readFileSync(resolve(file), 'utf8'))) : undefined;
    const report = setupDoctor(config?.cwd ?? resolve(value('--project') ?? process.cwd()), config);
    console.log(
      JSON.stringify(
        {
          ...report,
          providers: doctor().map((d) => ({
            provider: d.label,
            installed: d.installed,
            adapter: d.level,
            authentication: 'not checked',
          })),
        },
        null,
        2,
      ),
    );
    if (!report.ready) process.exitCode = 1;
  } else if (command === 'dashboard') {
    console.log('http://127.0.0.1:' + (process.env.ATSYS_PORT ?? 4310));
    console.log('Start the service with npm start from the AtSys repository.');
  } else if (command === 'init') {
    const project = realpathSync(value('--project') ?? process.cwd());
    if (!existsSync(resolve(project, '.git')))
      throw new Error('Project must be an existing Git repository');
    const dir = resolve(project, '.atsys');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = resolve(dir, 'project.json');
    if (existsSync(path))
      throw new Error('AtSys project configuration already exists; leaving it unchanged');
    writeFileSync(
      path,
      JSON.stringify(
        {
          schemaVersion: 1,
          root: project,
          controlPlaneDataDir: dataDir,
          preserveSource: true,
          memory: { mode: 'off' },
          observability: { enabled: false },
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    console.log(`Attached: ${path}\nSource, Git hooks and provider credentials unchanged.`);
  } else if (command === 'uninstall') {
    const project = realpathSync(value('--project') ?? process.cwd());
    const path = resolve(project, '.atsys/project.json');
    if (existsSync(path)) {
      const cfg = JSON.parse(readFileSync(path, 'utf8'));
      if (cfg.schemaVersion !== 1 || cfg.root !== project)
        throw new Error('Unrecognized configuration; refusing removal');
      rmSync(path);
      console.log('Detached AtSys configuration. Project files, state and evidence preserved.');
    } else console.log('No AtSys project configuration found. Nothing changed.');
  } else {
    const store = new Store(dataDir);
    const plane = new ControlPlane(store);
    try {
      if (command === 'status') {
        const ops = new OperationsStore(dataDir);
        const latest = ops.read().tasks[0];
        ops.close();
        if (latest) {
          console.log(
            formatTaskStatus(
              latest,
              process.stdout.columns || 88,
              Date.now(),
              'http://127.0.0.1:' + (process.env.ATSYS_PORT ?? 4310),
            ),
          );
        } else {
          console.table(
            store.read().runs.map((r) => ({
              id: r.id,
              name: r.name,
              status: r.status,
              result: r.result,
              adapter: r.adapter,
              updated: r.updatedAt,
            })),
          );
          console.log(`Console: http://127.0.0.1:${process.env.ATSYS_PORT ?? 4310}`);
        }
      } else if (command === 'stop') {
        if (!args[1]) throw new Error('Supply a run ID');
        console.log(JSON.stringify(plane.stop(args[1]), null, 2));
      } else if (command === 'run') {
        const split = args.indexOf('--');
        if (split < 0 || !args[split + 1]) throw new Error('Supply explicit argv after --');
        const cwd = realpathSync(value('--project') ?? process.cwd());
        let project = store.read().projects.find((p) => p.path === cwd && !p.simulated);
        if (!project) {
          let branch = 'unknown';
          try {
            branch =
              execFileSync('git', ['-C', cwd, 'branch', '--show-current'], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
              }).trim() || 'detached';
          } catch {
            /* non-Git explicit command root allowed */
          }
          project = plane.createProject({
            name: cwd.split('/').at(-1) ?? 'Local project',
            path: cwd,
            branch,
          });
        }
        const validator = value('--validator');
        if (validator && !['exit-code', 'benchmark-json'].includes(validator))
          throw new Error('Validator must be exit-code or benchmark-json');
        console.log(
          'Starting explicit local process; costs unknown, native pause/resume unavailable.',
        );
        const run = await executeProcess(plane, {
          projectId: project.id,
          argv: args.slice(split + 1),
          cwd,
          timeoutSeconds: Number(value('--timeout') ?? 3600),
          validator: validator as 'exit-code' | 'benchmark-json' | undefined,
          artifact: value('--artifact'),
        });
        console.log(JSON.stringify(run, null, 2));
        if (run.result !== 'validated_pass') process.exitCode = 1;
      } else throw new Error(`Unknown command: ${command}. Run atsys help.`);
    } finally {
      store.close();
    }
  }
} catch (error) {
  console.error(`AtSys: ${error instanceof Error ? error.message : 'Command failed'}`);
  process.exitCode = 1;
}
