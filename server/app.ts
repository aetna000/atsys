import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { applicationRoot } from './runtime.js';
import { withDefaults, validateConfig } from './operations/config.js';
import { ControlPlane, DomainError } from './control-plane.js';
import { doctor } from './doctor.js';
import { OperationsStore } from './operations/store.js';
import { verifyReport } from './operations/reports.js';
import { createTask, changeTask, generateRetrospectiveReport } from './operations/tasks.js';
import { configureTelegram, queueTestMessage } from './operations/telegram.js';
import { daemonHealthy } from './operations/watchdog.js';
import {
  ensureDaemon,
  ensureHookSupport,
  serviceStatus,
  installService,
  uninstallService,
} from './operations/service.js';
import { RUNTIMES } from '../shared/types.js';
import { VERSION } from '../shared/version.js';
export function createApp(
  plane: ControlPlane,
  operations?: OperationsStore,
  publicDirectory = resolve(applicationRoot, 'dist'),
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
      res.status(403).json({ error: 'Loopback hosts only' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      let permitted = !origin;
      try {
        if (origin) {
          const url = new URL(origin);
          const requestPort = req.headers.host?.split(':').at(-1);
          permitted =
            ['127.0.0.1', 'localhost'].includes(url.hostname) &&
            url.protocol === 'http:' &&
            (url.port === requestPort || url.port === '5173');
        }
      } catch {
        permitted = false;
      }
      if (!permitted || !req.is('application/json')) {
        res.status(403).json({ error: 'Mutation requires same-origin JSON request' });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_req, res) =>
    res.json({
      version: VERSION,
      timestamp: new Date().toISOString(),
      mode: 'local',
      instanceId: operations
        ? createHash('sha256').update(operations.directory).digest('hex')
        : null,
    }),
  );
  app.get('/api/state', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(plane.store.read());
  });
  app.get('/api/doctor', (_req, res) => res.json(doctor()));
  app.post('/api/projects', (req, res) =>
    res.status(201).json(
      plane.createProject(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            path: z.string().min(1).max(1000),
            branch: z.string().max(100).optional(),
          })
          .strict()
          .parse(req.body),
      ),
    ),
  );
  app.post('/api/runs', (req, res) =>
    res.status(201).json(
      plane.createRun(
        z
          .object({
            projectId: z.string(),
            name: z.string().trim().min(1).max(120),
            objective: z.string().trim().min(3).max(3000),
            runtime: z.enum(RUNTIMES),
          })
          .strict()
          .parse(req.body),
      ),
    ),
  );
  app.post('/api/runs/:id/stop', (req, res) => res.json(plane.stop(req.params.id as string)));
  app.post('/api/runs/:id/incident', (req, res) =>
    res.status(201).json(
      plane.inject(
        req.params.id as string,
        z
          .object({ category: z.enum(['crash', 'stall', 'evaluation']) })
          .strict()
          .parse(req.body).category,
      ),
    ),
  );
  app.post('/api/proposals/:id/decision', (req, res) =>
    res.json(
      plane.decide(
        req.params.id as string,
        z
          .object({ decision: z.enum(['approve', 'reject']) })
          .strict()
          .parse(req.body).decision,
      ),
    ),
  );
  app.post('/api/incidents/:id/acknowledge', (req, res) =>
    res.json(plane.acknowledge(req.params.id as string)),
  );
  app.patch('/api/settings', (req, res) =>
    res.json(
      plane.updateSettings(
        z
          .object({
            dailyBudget: z.number().positive().max(100000),
            retryLimit: z.number().int().min(0).max(5),
            staleAfterSeconds: z.number().int().min(10).max(3600),
            recoveryMode: z.enum(['observe_only', 'allowlisted']),
            memoryMode: z.literal('off'),
            notifications: z.boolean(),
          })
          .partial()
          .strict()
          .parse(req.body),
      ),
    ),
  );
  if (operations) {
    app.get('/api/operations', (_req, res) => {
      const state = operations.read();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ...state,
        daemonHealthy: daemonHealthy(state),
        service: serviceStatus(operations.directory),
      });
    });
    app.post('/api/tasks/drill', (_req, res) => {
      const cwd = resolve(operations.directory, 'drills', randomUUID());
      mkdirSync(cwd, { recursive: true, mode: 0o700 });
      const argv = [
        process.execPath,
        resolve(applicationRoot, 'examples/checkpoint-task.mjs'),
        cwd,
      ];
      const task = createTask(
        operations,
        withDefaults({
          name: 'Checkpoint recovery drill',
          objective:
            'Complete a 12-step task, recover from an intentional process crash, and independently validate its output.',
          cwd,
          argv,
          resumeArgv: argv,
          recovery: 'restart',
          maxRetries: 2,
          backoffSeconds: 2,
          progressFile: 'progress.json',
          progressTimeoutSeconds: 15,
          validator: 'command',
          validationArgv: [
            process.execPath,
            '-e',
            "const r=require('./result.json');process.exit(r.completed===12 && r.passed ? 0 : 1)",
          ],
          requiredArtifacts: ['result.json'],
          timeoutSeconds: 60,
          taskTimeoutSeconds: 300,
        }),
      );
      ensureDaemon(operations);
      res.status(201).json(task);
    });
    app.post('/api/tasks', async (req, res) => {
      const config = validateConfig(req.body);
      await ensureHookSupport(operations, config);
      const task = createTask(operations, config);
      ensureDaemon(operations);
      res.status(201).json(task);
    });
    app.get('/api/tasks/:id/report', (req, res) => {
      const task = operations.read().tasks.find((t) => t.id === req.params.id);
      if (!task) throw new DomainError('Task not found', 404);
      const report = task.reports?.at(-1);
      if (!report)
        throw new DomainError(
          task.reportError ??
            'No durable report; explicit retrospective generation is available for terminal legacy tasks.',
          404,
        );
      res.setHeader('Cache-Control', 'no-store');
      res.json(verifyReport(operations.directory, report));
    });
    app.post('/api/tasks/:id/report', (req, res) => {
      const body = z
        .object({ outcomeFile: z.string().max(1000).optional() })
        .strict()
        .parse(req.body ?? {});
      const report = generateRetrospectiveReport(
        operations,
        req.params.id as string,
        body.outcomeFile,
      );
      res.status('error' in report ? 409 : 200).json(report);
    });
    app.patch('/api/tasks/:id', async (req, res) => {
      const body = z
        .object({ config: z.unknown(), revision: z.number().int() })
        .strict()
        .parse(req.body);
      const config = validateConfig(body.config);
      await ensureHookSupport(operations, config);
      res.json(changeTask(operations, req.params.id as string, 'configure', config, body.revision));
    });
    app.post('/api/tasks/:id/:action', async (req, res) => {
      const action = z.enum(['stop', 'retry', 'pause', 'resume']).parse(req.params.action);
      if (action === 'retry') {
        const task = operations.read().tasks.find((t) => t.id === req.params.id);
        if (task) await ensureHookSupport(operations, task.config);
      }
      res.json(changeTask(operations, req.params.id as string, action));
      ensureDaemon(operations);
    });
    app.patch('/api/telegram', (req, res) => res.json(configureTelegram(operations, req.body)));
    app.post('/api/telegram/test', (_req, res) => {
      res.status(202).json(queueTestMessage(operations));
      ensureDaemon(operations);
    });
    app.post('/api/service/:action', (req, res) => {
      const action = z.enum(['install', 'uninstall', 'start']).parse(req.params.action);
      if (action === 'start') {
        ensureDaemon(operations);
        res.json(serviceStatus(operations.directory));
      } else
        res.json(action === 'install' ? installService(operations) : uninstallService(operations));
    });
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
  const dist = publicDirectory;
  if (existsSync(dist)) {
    app.use(express.static(dist));
    // The install may live under .local/.venv. Root the public filename explicitly
    // so sendFile does not mistake hidden installation ancestors for public dotfiles.
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: dist }));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      return;
    }
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON request' });
      return;
    }
    console.error(
      'AtSys request failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    res.status(500).json({ error: 'Internal request failed. Check local server diagnostics.' });
  });
  return app;
}
