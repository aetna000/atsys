import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Plus,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Bell,
  Settings2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, useConsole } from '../api';
import { readableAttemptLog, shortText, taskPresentation } from '../../shared/task-presentation';
import { Badge, PageTitle, Panel, Time, Empty } from '../components/common';
import {
  taskDefaults,
  type TaskConfig,
  type ManagedTask,
  type OperationsView,
  type TelegramConfig,
} from '../../shared/operations';
export function Tasks() {
  const { notify, search } = useConsole();
  const [view, setView] = useState<OperationsView | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<TaskConfig | null>(null);
  const [editing, setEditing] = useState<ManagedTask | null>(null);
  const [busy, setBusy] = useState(false);
  const { taskId } = useParams();
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      setView(await api<OperationsView>('/operations'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Task service unavailable');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(path: string, body: unknown = {}, method = 'POST') {
    setBusy(true);
    try {
      const result = await api<ManagedTask>(path, body, method);
      await refresh();
      return result;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed', true);
    } finally {
      setBusy(false);
    }
  }
  const selected = view?.tasks.find((t) => t.id === taskId);
  const tasks =
    view?.tasks.filter((t) =>
      `${t.config.name} ${t.config.objective} ${t.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const openNew = () => {
    setEditing(null);
    setForm({
      ...taskDefaults,
      worker: 'codex',
      activityTimeoutSeconds: 600,
      validator: 'command',
      validationArgv: ['npm', 'test'],
      argv: [],
    });
  };
  if (!view)
    return (
      <Alert severity={error ? 'error' : 'info'}>
        {error || 'Connecting to the task supervisor…'}
      </Alert>
    );
  return (
    <div className="operations-page">
      <PageTitle
        eyebrow="DURABLE TASK SUPERVISION"
        title={selected ? selected.config.name : 'Work that stays looked after'}
        description={
          selected
            ? selected.config.objective
            : 'Run the task. Watch its progress. Recover within policy. Bring you in when needed.'
        }
        action={
          <>
            <Button
              variant="outlined"
              onClick={() =>
                void act('/tasks/drill').then((t) => {
                  if (t) navigate(`/tasks/${t.id}`);
                })
              }
              disabled={busy}
            >
              Run recovery drill
            </Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={openNew}>
              New managed task
            </Button>
          </>
        }
      />
      {error && (
        <Alert severity="warning">Connection lost. These records may be stale. {error}</Alert>
      )}
      <div className="ops-health-strip">
        <span>
          <i className={view.daemonHealthy ? 'ops-dot healthy' : 'ops-dot failed'} />
          <strong>{view.daemonHealthy ? 'Watchdog online' : 'Watchdog heartbeat missing'}</strong>
          {view.daemon && (
            <small>
              Heartbeat <Time value={view.daemon.heartbeatAt} />
            </small>
          )}
        </span>
        <span>
          <ShieldCheck size={17} />
          {view.service.loaded
            ? 'OS restart protection active'
            : 'OS restart protection not installed'}
        </span>
        <Button
          size="small"
          onClick={() => {
            setTab(1);
            navigate('/tasks');
          }}
        >
          Manage service & alerts
        </Button>
      </div>
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} aria-label="Task workspace views">
        <Tab label="Tasks & wiring" />
        <Tab label="Service & Telegram" />
      </Tabs>
      {tab === 1 ? (
        <ServiceAlerts view={view} busy={busy} action={act} />
      ) : selected ? (
        <TaskDetail
          task={selected}
          busy={busy}
          action={act}
          back={() => navigate('/tasks')}
          configure={() => {
            setEditing(structuredClone(selected));
            setForm(structuredClone(selected.config));
          }}
        />
      ) : (
        <>
          <div className="ops-metrics">
            {[
              [
                'Active tasks',
                view.tasks.filter((t) =>
                  ['running', 'recovering', 'supervising', 'repairing', 'queued'].includes(
                    t.status,
                  ),
                ).length,
                Activity,
              ],
              [
                'Need your attention',
                view.tasks.filter((t) => t.status === 'needs_attention').length,
                Bell,
              ],
              [
                'Validated completions',
                view.tasks.filter((t) => t.status === 'completed').length,
                CheckCircle2,
              ],
            ].map(([label, value, Icon]) => {
              const Component = Icon as typeof Activity;
              return (
                <div key={String(label)}>
                  <Component size={19} />
                  <span>{String(label)}</span>
                  <strong>{String(value)}</strong>
                </div>
              );
            })}
          </div>
          <div className="ops-wiring">
            <Wire
              icon={Terminal}
              label="01 · WORKER"
              title="Runs your task"
              detail="Explicit command or native Codex exec"
            />
            <Wire
              icon={Activity}
              label="02 · OBSERVER"
              title="Checks the evidence"
              detail="Runner heartbeat, progress & deadline"
            />
            <Wire
              icon={Bot}
              label="03 · SUPERVISOR"
              title="Diagnoses exceptions"
              detail="Codex proposal → deterministic policy"
            />
            <Wire
              icon={Bell}
              label="04 · YOU"
              title="Receives escalations"
              detail={
                view.telegram.enabled
                  ? 'Telegram notifications enabled'
                  : 'Telegram ready to configure'
              }
            />
          </div>
          <Panel
            title="Managed tasks"
            eyebrow="REAL LOCAL EXECUTION"
            action={<span className="muted">{tasks.length} tasks</span>}
          >
            {!tasks.length ? (
              <Empty
                title="Delegate your first task"
                description="Delegate a feature, bug fix, refactor, test suite, build, migration, or script. AtSys keeps ownership through execution, validation and recovery."
                action={<Button onClick={openNew}>Configure a task</Button>}
              />
            ) : (
              <div className="ops-task-list">
                {tasks.map((t) => {
                  const a = t.attempts.at(-1);
                  return (
                    <button
                      key={t.id}
                      className="ops-task-row"
                      onClick={() => navigate(`/tasks/${t.id}`)}
                    >
                      <div className="ops-task-icon">
                        <Terminal size={20} />
                      </div>
                      <div className="ops-task-main">
                        <strong>{t.config.name}</strong>
                        <span>{t.config.objective}</span>
                        <small>{t.config.cwd}</small>
                      </div>
                      <div className="ops-task-meta">
                        <Badge value={t.status} />
                        <span>
                          {t.attempts.filter((a) => a.phase === 'worker').length} worker attempts ·{' '}
                          {t.config.recovery}
                        </span>
                        {a?.progress && (
                          <span>
                            {a.progress.completed} / {a.progress.total} steps
                          </span>
                        )}
                        <Time value={t.updatedAt} />
                      </div>
                      <ArrowRight size={17} />
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
          <p className="ops-footnote">
            Tasks continue when this tab or Codex closes. OS protection restarts the watchdog. Local
            execution pauses while this computer sleeps; use an always-on host for continuous
            operation.
          </p>
        </>
      )}
      {form && (
        <TaskForm
          config={form}
          editing={editing}
          close={() => setForm(null)}
          save={async (config) => {
            const t = await act(
              editing ? `/tasks/${editing.id}` : '/tasks',
              editing ? { config, revision: editing.revision } : config,
              editing ? 'PATCH' : 'POST',
            );
            if (t) {
              setForm(null);
              navigate(`/tasks/${t.id}`);
            }
          }}
          busy={busy}
        />
      )}
    </div>
  );
}
function Wire({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="ops-wire">
      <span>
        <Icon size={19} />
        {label}
      </span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}
function TaskDetail({
  task: t,
  busy,
  action,
  back,
  configure,
}: {
  task: ManagedTask;
  busy: boolean;
  action: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  back: () => void;
  configure: () => void;
}) {
  const a = t.attempts.at(-1);
  const summary = taskPresentation(t);
  const [attemptId, setAttemptId] = useState('');
  const inspected = t.attempts.find((a) => a.id === attemptId) ?? a;
  return (
    <>
      <div className="ops-detail-actions">
        <Button onClick={back}>← All managed tasks</Button>
        <Badge value={t.status} />
        <span className="mono">{t.id.slice(0, 18)}</span>
        <Button startIcon={<Settings2 size={15} />} onClick={configure}>
          Edit task wiring
        </Button>
        {['needs_attention', 'stopped'].includes(t.status) ? (
          <Button disabled={busy} onClick={() => void action(`/tasks/${t.id}/retry`)}>
            Retry within policy
          </Button>
        ) : (
          !['completed'].includes(t.status) && (
            <Button
              color="error"
              disabled={busy || t.stopRequested}
              onClick={() => void action(`/tasks/${t.id}/stop`)}
            >
              {t.stopRequested ? 'Stopping…' : 'Stop task'}
            </Button>
          )
        )}
      </div>
      <Panel title="What is happening now" eyebrow="CURRENT TASK · NOT RAW TRANSCRIPTS">
        <div className="ops-panel-body">
          <Alert
            severity={
              t.status === 'needs_attention'
                ? 'warning'
                : t.status === 'completed'
                  ? 'success'
                  : 'info'
            }
          >
            <strong>{summary.state}</strong>
            <p>{shortText(summary.activity, 250)}</p>
          </Alert>
          <dl className="ops-facts" style={{ marginTop: 16 }}>
            <dt>Reported progress</dt>
            <dd>
              {summary.progress
                ? `${summary.progress.completed} / ${summary.progress.total} worker-reported units${summary.progressFromPreviousAttempt ? ' · saved checkpoint' : ''}`
                : 'No progress reported; no percentage assumed'}
            </dd>
            <dt>Latest observer goal check</dt>
            <dd>
              {summary.observerAt ? (
                <>
                  <Time value={summary.observerAt} /> · {shortText(summary.observerSummary, 170)}
                </>
              ) : (
                'No check recorded yet'
              )}
            </dd>
            <dt>Supervisor</dt>
            <dd>{shortText(summary.supervisor, 220)}</dd>
            <dt>Next action</dt>
            <dd>{shortText(summary.next, 600)}</dd>
          </dl>
        </div>
      </Panel>
      <div className="ops-wiring">
        <Wire
          icon={Terminal}
          label="WORKER"
          title={
            t.config.worker === 'codex'
              ? t.config.model || 'Codex · configured default'
              : 'Local command'
          }
          detail={
            t.config.worker === 'codex' ? `${t.config.reasoningEffort} reasoning` : t.config.argv[0]
          }
        />
        <Wire
          icon={Activity}
          label="OBSERVER"
          title={`Heartbeat ≤ ${t.config.heartbeatTimeoutSeconds}s`}
          detail={
            t.config.progressTimeoutSeconds
              ? `Progress window ${t.config.progressTimeoutSeconds}s`
              : 'Goal progress unmonitored · heartbeat is liveness only'
          }
        />
        <Wire
          icon={Bot}
          label="SUPERVISOR"
          title={
            t.config.recovery === 'supervised'
              ? t.config.supervisorModel || 'Codex · configured default'
              : t.config.recovery === 'restart'
                ? 'Deterministic restart'
                : 'Notify only'
          }
          detail={`${t.config.maxRetries} retries · repair ${t.config.allowRepair ? 'permitted' : 'disabled'}`}
        />
        <Wire
          icon={CheckCircle2}
          label="COMPLETION"
          title={t.config.validator}
          detail={
            t.config.validator === 'command'
              ? JSON.stringify(t.config.validationArgv)
              : t.config.artifact || 'Require successful process exit'
          }
        />
      </div>
      <div className="ops-detail-grid">
        <Panel title="Execution & evidence" action={<Badge value={a?.status ?? 'queued'} />}>
          <div className="ops-panel-body">
            <details className="ops-disclosure">
              <summary>Technical configuration and full execution plan</summary>
              <dl className="ops-facts">
                <dt>Workspace</dt>
                <dd className="mono">{t.config.cwd}</dd>
                <dt>Execution arguments</dt>
                <dd className="mono">
                  {t.config.worker === 'codex'
                    ? 'Codex objective-driven execution (argv not required)'
                    : JSON.stringify(t.config.argv)}
                </dd>
                <dt>Observer check detail</dt>
                <dd>
                  {t.events.find((e) => e.type === 'goal.checked')?.message ??
                    'No goal check recorded yet'}
                </dd>
                <dt>Worker network access</dt>
                <dd>
                  {t.config.worker === 'command'
                    ? 'Local commands use local-user permissions'
                    : t.config.networkAccess
                      ? 'Authorized for worker and repair'
                      : 'Disabled in Codex sandbox'}
                </dd>
                <dt>Execution plan</dt>
                <dd>{t.config.plan || 'Worker follows the task objective'}</dd>
                <dt>Validation command</dt>
                <dd className="mono">
                  {t.config.validationArgv.length
                    ? JSON.stringify(t.config.validationArgv)
                    : 'Not configured'}
                </dd>
                <dt>Resume arguments</dt>
                <dd className="mono">
                  {t.config.worker === 'codex'
                    ? 'Codex objective and recovery instructions'
                    : t.config.resumeArgv.length
                      ? JSON.stringify(t.config.resumeArgv)
                      : 'Original command on retry'}
                </dd>
                <dt>Attempt / task deadline</dt>
                <dd>
                  {t.config.timeoutSeconds}s / {t.config.taskTimeoutSeconds}s
                </dd>
                <dt>Latest runner heartbeat</dt>
                <dd>{a ? <Time value={a.heartbeatAt} /> : 'Not started'}</dd>
                <dt>Progress signal</dt>
                <dd>
                  {summary.progress
                    ? `${summary.progress.completed} / ${summary.progress.total} · ${summary.progress.checkpoint ?? 'no checkpoint label'}`
                    : 'No reported progress yet'}
                </dd>
              </dl>
            </details>
            {summary.progress && (
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (100 * summary.progress.completed) / summary.progress.total)}
              />
            )}
            {a?.validation && (
              <Alert severity={a.validation.passed ? 'success' : 'error'} sx={{ mt: 2 }}>
                {a.validation.detail}
                {a.validation.digest && (
                  <div className="mono ops-digest">SHA-256 {a.validation.digest}</div>
                )}
                {a.validation.artifacts?.map((item) => (
                  <div key={item.path} className="mono ops-digest">
                    {item.path} · SHA-256 {item.digest}
                  </div>
                ))}
              </Alert>
            )}
            <TextField
              select
              label="Inspect attempt"
              size="small"
              fullWidth
              sx={{ mt: 2, mb: 2 }}
              value={inspected?.id ?? ''}
              onChange={(e) => setAttemptId(e.target.value)}
            >
              {t.attempts.length ? (
                t.attempts.map((a, i) => (
                  <MenuItem key={a.id} value={a.id}>
                    {i + 1} · {a.phase} · {a.status}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="">Awaiting execution</MenuItem>
              )}
            </TextField>
            {inspected?.proposal && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>Supervisor proposal: {inspected.proposal.action}</strong>
                <p>{shortText(inspected.proposal.reason, 250)}</p>
                <details className="ops-disclosure">
                  <summary>Full recovery instructions</summary>
                  <p>{inspected.proposal.instructions}</p>
                </details>
              </Alert>
            )}
            {inspected?.failure && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {inspected.failure}
              </Alert>
            )}
            <pre className="ops-output" aria-label="Readable attempt messages">
              {inspected ? readableAttemptLog(inspected.output, 6) : 'Worker has not started.'}
            </pre>
            <details className="ops-disclosure">
              <summary>Raw provider output (technical JSON)</summary>
              <pre className="ops-output" aria-label="Attempt output">
                {inspected?.output ||
                  (inspected && !['starting', 'running'].includes(inspected.status)
                    ? 'This attempt produced no stdout or stderr.'
                    : 'Output will appear here when the runner starts.')}
              </pre>
            </details>
          </div>
        </Panel>
        <Panel title="Supervision timeline" eyebrow="PERSISTED EVENTS & POLICY DECISIONS">
          <div className="ops-timeline">
            {t.events.slice(0, 12).map((e) => (
              <div key={e.id}>
                <span className="ops-timeline-dot" />
                <div>
                  <small>
                    {e.role} · <Time value={e.at} />
                  </small>
                  <strong>{e.type.replaceAll('.', ' · ')}</strong>
                  <p>{shortText(e.message, 220)}</p>
                </div>
              </div>
            ))}
            {t.events.length > 12 && (
              <details className="ops-disclosure">
                <summary>Older events ({t.events.length - 12})</summary>
                {t.events.slice(12).map((e) => (
                  <p key={e.id}>
                    <Time value={e.at} /> · {e.role} · {e.type}
                    <br />
                    {shortText(e.message, 300)}
                  </p>
                ))}
              </details>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
function TaskForm({
  config,
  editing,
  close,
  save,
  busy,
}: {
  config: TaskConfig;
  editing: ManagedTask | null;
  close: () => void;
  save: (c: TaskConfig) => Promise<void>;
  busy: boolean;
}) {
  const [c, setC] = useState(config);
  const [argv, setArgv] = useState(JSON.stringify(config.argv, null, 2));
  const [resume, setResume] = useState(JSON.stringify(config.resumeArgv, null, 2));
  const [validation, setValidation] = useState(JSON.stringify(config.validationArgv, null, 2));
  const [artifacts, setArtifacts] = useState(config.requiredArtifacts.join('\n'));
  const [error, setError] = useState('');
  const field = (key: keyof TaskConfig, label: string, type = 'text', help?: string) => (
    <TextField
      key={key}
      fullWidth
      label={label}
      type={type}
      value={c[key]}
      helperText={help}
      onChange={(e) =>
        setC({ ...c, [key]: type === 'number' ? Number(e.target.value) : e.target.value })
      }
    />
  );
  const select = (key: keyof TaskConfig, label: string, values: [string, string][]) => (
    <TextField
      key={key}
      select
      fullWidth
      label={label}
      value={c[key]}
      onChange={(e) => setC({ ...c, [key]: e.target.value })}
    >
      {values.map(([v, label]) => (
        <MenuItem value={v} key={v}>
          {label}
        </MenuItem>
      ))}
    </TextField>
  );
  const efforts: [string, string][] = ['low', 'medium', 'high', 'xhigh'].map((v) => [v, v]);
  return (
    <Dialog open onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>{editing ? 'Edit task configuration' : 'New managed task'}</DialogTitle>
      <DialogContent>
        <p className="muted">
          Delegate coding work or run an existing command. Add independent completion checks and a
          recovery policy.
        </p>
        {error && <Alert severity="error">{error}</Alert>}
        <div className="ops-form-grid">
          {field('name', 'Task name')}
          {field('cwd', 'Working directory', 'text', 'Existing absolute local path')}
          <TextField
            className="ops-full"
            multiline
            minRows={2}
            label="Task objective"
            value={c.objective}
            onChange={(e) => setC({ ...c, objective: e.target.value })}
          />
          <TextField
            className="ops-full"
            multiline
            minRows={2}
            label="Execution plan & constraints"
            value={c.plan}
            onChange={(e) => setC({ ...c, plan: e.target.value })}
            helperText="Optional steps, acceptance criteria, files in scope, and constraints for the coding agent."
          />
          {select('worker', 'Worker', [
            ['command', 'Local command'],
            ['codex', 'Codex coding agent'],
          ])}
          {select('validator', 'Completion validator', [
            ['command', 'Independent validation command'],
            ['exit-code', 'Successful process exit'],
            ['benchmark-json', 'Benchmark JSON (optional adapter)'],
          ])}
          {c.worker === 'command' ? (
            <TextField
              className="ops-full"
              multiline
              minRows={3}
              label="Execution argv (JSON array)"
              value={argv}
              onChange={(e) => setArgv(e.target.value)}
              helperText={'Example: ["npm", "run", "build"] · no implicit shell'}
            />
          ) : (
            <>
              {field('model', 'Worker model', 'text', 'Blank uses your Codex configuration')}
              {select('reasoningEffort', 'Worker reasoning effort', efforts)}
            </>
          )}
          {c.validator === 'command' && (
            <>
              <TextField
                className="ops-full"
                multiline
                minRows={2}
                label="Validation argv (JSON array)"
                value={validation}
                onChange={(e) => setValidation(e.target.value)}
                helperText={
                  'Example: ["npm", "test"] or ["python3", "-m", "pytest"] · runs independently after the worker finishes'
                }
              />
              {field('validationTimeoutSeconds', 'Validation timeout (seconds)', 'number')}
            </>
          )}
          <TextField
            className="ops-full"
            multiline
            minRows={2}
            label="Required artifacts (one relative path per line)"
            value={artifacts}
            onChange={(e) => setArtifacts(e.target.value)}
            helperText="Optional output files; AtSys checks presence and records their SHA-256 digests."
          />
          {c.validator === 'benchmark-json' &&
            field(
              'artifact',
              'Result artifact',
              'text',
              'Relative JSON path: completed, total, passed, accuracy',
            )}
        </div>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ChevronDown size={17} />}>
            Observation & deadlines
          </AccordionSummary>
          <AccordionDetails>
            <div className="ops-form-grid">
              <FormControlLabel
                className="ops-full"
                control={
                  <Switch
                    checked={c.goalMonitoring}
                    onChange={(_, v) => setC({ ...c, goalMonitoring: v })}
                  />
                }
                label="Default goal-progress monitoring for new Codex tasks"
              />
              {field(
                'progressFile',
                'Progress JSON path',
                'text',
                'Optional relative path with completed, total, checkpoint',
              )}
              {field(
                'progressTimeoutSeconds',
                'Stall window (seconds)',
                'number',
                '0 disables progress-stall detection',
              )}
              {field(
                'activityTimeoutSeconds',
                'Output inactivity window (seconds)',
                'number',
                '0 disables. Process output is activity, not proof of progress.',
              )}
              {field('heartbeatTimeoutSeconds', 'Runner heartbeat timeout (seconds)', 'number')}
              {field('timeoutSeconds', 'Worker attempt timeout (seconds)', 'number')}
              {field('taskTimeoutSeconds', 'Total task lifetime (seconds)', 'number')}
              <FormControlLabel
                className="ops-full"
                control={
                  <Switch
                    checked={c.networkAccess}
                    onChange={(_, v) => setC({ ...c, networkAccess: v })}
                  />
                }
                label="Authorize network access for Codex worker and bounded repair"
              />
            </div>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ChevronDown size={17} />}>
            Recovery & supervisor
          </AccordionSummary>
          <AccordionDetails>
            <div className="ops-form-grid">
              {select('recovery', 'Exception policy', [
                ['supervised', 'Ask Codex supervisor'],
                ['restart', 'Restart declared command'],
                ['notify', 'Stop and notify me'],
              ])}
              {field('maxRetries', 'Maximum worker retries', 'number')}
              {field('backoffSeconds', 'Retry delay (seconds)', 'number')}
              <TextField
                className="ops-full"
                multiline
                minRows={2}
                label="Checkpoint resume argv (JSON array)"
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                helperText="Optional. Empty uses the original command; it must be safe to repeat."
              />
              {c.recovery === 'supervised' && (
                <>
                  {field(
                    'supervisorModel',
                    'Supervisor model',
                    'text',
                    'Blank uses your Codex configuration',
                  )}
                  {select('supervisorEffort', 'Supervisor reasoning effort', efforts)}
                  {field('supervisorTimeoutSeconds', 'Supervisor timeout (seconds)', 'number')}
                  {field('maxSupervisorCalls', 'Maximum supervisor calls', 'number')}
                  <FormControlLabel
                    className="ops-full"
                    control={
                      <Switch
                        checked={c.allowRepair}
                        onChange={(_, v) => setC({ ...c, allowRepair: v })}
                      />
                    }
                    label="Authorize a bounded Codex repair in this workspace before retry"
                  />
                  {c.allowRepair &&
                    field('repairTimeoutSeconds', 'Repair timeout (seconds)', 'number')}
                </>
              )}
            </div>
          </AccordionDetails>
        </Accordion>
        <Alert severity="info" sx={{ mt: 2 }}>
          Commands execute as your local user. Diagnosis uses a read-only Codex sandbox. Enabled
          repair uses workspace-write. Active attempts keep their saved configuration; edits affect
          future attempts and the total task lifetime.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          disabled={busy}
          variant="contained"
          onClick={() => {
            try {
              const parsed = JSON.parse(argv);
              const parsedResume = JSON.parse(resume);
              const parsedValidation = JSON.parse(validation);
              if (
                !Array.isArray(parsed) ||
                !Array.isArray(parsedResume) ||
                !Array.isArray(parsedValidation)
              )
                throw new Error('Arguments must be JSON arrays');
              setError('');
              void save({
                ...c,
                argv: parsed,
                resumeArgv: parsedResume,
                validationArgv: parsedValidation,
                requiredArtifacts: artifacts
                  .split('\n')
                  .map((p) => p.trim())
                  .filter(Boolean),
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Invalid arguments');
            }
          }}
        >
          {editing ? 'Save configuration' : 'Start managed task'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
function ServiceAlerts({
  view,
  busy,
  action,
}: {
  view: OperationsView;
  busy: boolean;
  action: (path: string, body?: unknown, method?: string) => Promise<unknown>;
}) {
  const [telegram, setTelegram] = useState<TelegramConfig>(view.telegram);
  const [token, setToken] = useState('');
  return (
    <div className="ops-detail-grid ops-settings">
      <Panel title="Who watches the watchdog?" eyebrow="OPERATING SYSTEM SUPERVISION">
        <div className="ops-panel-body">
          <div className="ops-service-icon">
            <ShieldCheck size={32} />
          </div>
          <h3>{view.service.loaded ? 'Protected by launchd' : 'Enable OS restart protection'}</h3>
          <p>{view.service.detail}</p>
          <dl className="ops-facts">
            <dt>Watchdog heartbeat</dt>
            <dd>{view.daemon ? <Time value={view.daemon.heartbeatAt} /> : 'Unavailable'}</dd>
            <dt>Watchdog PID</dt>
            <dd>{view.daemon?.pid ?? '—'}</dd>
            <dt>Service</dt>
            <dd className="mono">{view.service.label}</dd>
            <dt>Scope</dt>
            <dd>Current user · starts at login · local machine</dd>
          </dl>
          <div className="ops-buttons">
            <Button
              variant="contained"
              disabled={busy || !view.service.supported}
              onClick={() =>
                void action('/service/' + (view.service.loaded ? 'uninstall' : 'install'))
              }
            >
              {view.service.loaded ? 'Remove OS service' : 'Install OS service'}
            </Button>
            <Button disabled={busy} onClick={() => void action('/service/start')}>
              Start watchdog
            </Button>
          </div>
          <Alert severity="info" sx={{ mt: 3 }}>
            Closing the dashboard does not stop tasks. A sleeping or powered-off computer cannot run
            the watchdog or send alerts. For that requirement, run AtSys on an always-on host.
          </Alert>
        </div>
      </Panel>
      <Panel title="Telegram notifications" eyebrow="ESCALATION CHANNEL">
        <div className="ops-panel-body">
          <p>
            Receive incidents, recovery decisions and validated completions. Start a chat with your
            Telegram bot before testing.
          </p>
          <div className="ops-form-grid">
            <TextField
              label="Bot token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              helperText={
                view.telegram.hasToken
                  ? 'Token stored. Leave blank to keep it.'
                  : 'Stored privately on this machine; never returned by the API.'
              }
            />
            <TextField
              label="Chat ID"
              value={telegram.chatId}
              onChange={(e) => setTelegram({ ...telegram, chatId: e.target.value })}
            />
            {(['enabled', 'onIncident', 'onRecovery', 'onCompletion'] as const).map((key) => (
              <FormControlLabel
                key={key}
                control={
                  <Switch
                    checked={telegram[key]}
                    onChange={(_, v) => setTelegram({ ...telegram, [key]: v })}
                  />
                }
                label={
                  {
                    enabled: 'Enable Telegram',
                    onIncident: 'Incidents & escalation',
                    onRecovery: 'Recovery decisions',
                    onCompletion: 'Validated completion',
                  }[key]
                }
              />
            ))}
            <TextField
              label="Delivery attempt limit"
              type="number"
              value={telegram.maxAttempts}
              onChange={(e) => setTelegram({ ...telegram, maxAttempts: Number(e.target.value) })}
            />
          </div>
          <div className="ops-buttons">
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => {
                const { hasToken: _, ...config } = telegram;
                void action('/telegram', { ...config, ...(token ? { token } : {}) }, 'PATCH').then(
                  (result) => {
                    if (result) setToken('');
                  },
                );
              }}
            >
              Save Telegram configuration
            </Button>
            <Button
              disabled={busy || !view.telegram.enabled}
              onClick={() => void action('/telegram/test')}
            >
              Send test notification
            </Button>
          </div>
          <h3>Delivery history</h3>
          {!view.deliveries.length ? (
            <p className="muted">No notifications queued.</p>
          ) : (
            <div className="ops-deliveries">
              {view.deliveries.slice(0, 15).map((d) => (
                <div key={d.id}>
                  <Badge value={d.status} />
                  <span>
                    {d.text}
                    <small>
                      {d.attempts} delivery attempts · <Time value={d.createdAt} />
                    </small>
                    {d.error && <small>{d.error}</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
