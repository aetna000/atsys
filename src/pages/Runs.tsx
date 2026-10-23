import { useState } from 'react';
import { Alert, Button, Tab, Tabs } from '@mui/material';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileJson,
  Fingerprint,
  GitBranch,
  Plus,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, projectRuns, useConsole } from '../api';
import { runtimeLabel, TERMINAL } from '../../shared/types';
import {
  Badge,
  DetailRow,
  Empty,
  PageTitle,
  Panel,
  Progress,
  RuntimeIcon,
  Time,
  money,
  timestamp,
} from '../components/common';
import { LiveLogs } from '../components/LiveLogs';
export function Runs({ onNewRun }: { onNewRun: () => void }) {
  const c = useConsole();
  const { runId } = useParams();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'evidence' ? 1 : 0);
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const run = c.state.runs.find((r) => r.id === runId);
  const runs = projectRuns(c.state, c.projectId).filter(
    (r) =>
      (status === 'all' || r.status === status) &&
      `${r.name} ${r.id} ${r.runtime}`.toLowerCase().includes(c.search.toLowerCase()),
  );
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    await c.perform(fn, message);
    setBusy(false);
  }
  if (runId && !run)
    return (
      <Empty
        title="Run not found"
        action={
          <Button component={Link} to="/runs">
            Back to runs
          </Button>
        }
      />
    );
  if (!run)
    return (
      <>
        <PageTitle
          eyebrow="OBJECTIVES, CHECKPOINTS, VERIFIED OUTCOMES"
          title="Runs"
          description="Follow every task from first heartbeat to a validated result."
          action={
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={onNewRun}>
              New run
            </Button>
          }
        />
        <Panel
          title="Run history"
          action={
            <select
              aria-label="Filter run status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              {['running', 'awaiting_approval', 'completed', 'failed', 'aborted', 'blocked'].map(
                (s) => (
                  <option value={s} key={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ),
              )}
            </select>
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Run / objective</th>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Result</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="table-main-link" to={`/runs/${r.id}`}>
                        {r.name}
                      </Link>
                      <small className="mono">
                        {r.id} · {r.adapter === 'simulator' ? 'Simulated' : 'Local process'}
                      </small>
                    </td>
                    <td>
                      <span className="inline">
                        <RuntimeIcon runtime={r.runtime} size={22} />
                        {runtimeLabel(r.runtime)}
                      </span>
                    </td>
                    <td>
                      <Badge value={r.status} />
                    </td>
                    <td className="progress-cell">
                      <Progress value={r.progress} total={r.total} />
                      <small>
                        {r.progress ?? '—'} / {r.total ?? 'unknown'} cases
                      </small>
                    </td>
                    <td>
                      <Badge value={r.result} />
                    </td>
                    <td>
                      <Time value={r.updatedAt} />
                    </td>
                    <td>
                      <Link
                        className="icon-link"
                        aria-label={`Inspect ${r.name}`}
                        to={`/runs/${r.id}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!runs.length && (
            <Empty
              title="No matching runs"
              description="Start a simulation or change the current filters."
              action={<Button onClick={onNewRun}>New run</Button>}
            />
          )}
        </Panel>
      </>
    );
  const validator = run.validator ?? (run.adapter === 'simulator' ? 'benchmark-json' : 'none');
  const project = c.state.projects.find((p) => p.id === run.projectId);
  const events = c.state.events.filter((e) => e.runId === run.id);
  const evidence = c.state.evidence.filter((e) => e.runId === run.id);
  const receipts = c.state.receipts.filter((r) => r.runId === run.id);
  const usage = c.state.usage.filter((u) => u.runId === run.id);
  const spending = usage.reduce((s, u) => s + (u.amount ?? 0), 0);
  const agent = c.state.agents.find((a) => a.sessionId === run.nativeSessionId);
  const terminal = TERMINAL.includes(run.status);
  return (
    <>
      <Link to="/runs" className="back-link">
        <ArrowLeft size={13} />
        All runs
      </Link>
      <PageTitle
        eyebrow={`${run.id} / ${run.adapter === 'simulator' ? 'SIMULATED RUN' : 'LOCAL PROCESS'}`}
        title={run.name}
        description={run.objective}
        action={
          <>
            <Badge value={run.status} />
            {!terminal && (
              <Button
                disabled={busy}
                variant="outlined"
                color="error"
                startIcon={<Square size={13} />}
                onClick={() =>
                  action(() => api(`/runs/${run.id}/stop`, {}), 'Stop request recorded')
                }
              >
                Stop run
              </Button>
            )}
          </>
        }
      />
      <div className="run-facts">
        <span>
          <GitBranch size={14} />
          {project?.branch}
        </span>
        <span>
          <RuntimeIcon runtime={run.runtime} size={20} />
          {runtimeLabel(run.runtime)}
        </span>
        <span>
          <Clock3 size={14} />
          Started <Time value={run.startedAt} />
        </span>
        <span>
          Timeout{' '}
          {run.timeoutSeconds < 60
            ? `${run.timeoutSeconds}s`
            : run.timeoutSeconds < 3600
              ? `${Math.round(run.timeoutSeconds / 60)}m`
              : `${(run.timeoutSeconds / 3600).toFixed(1)}h`}
        </span>
        <span>Budget {money(run.budget)}</span>
        <span>
          Updated <Time value={run.updatedAt} />
        </span>
      </div>
      <div className="run-detail-grid">
        <div>
          <Panel
            title="Task progress"
            action={
              <span className="mono">
                {run.progress ?? '—'} / {run.total ?? 'unknown'} cases
              </span>
            }
          >
            <div className="run-progress">
              <Progress value={run.progress} total={run.total} />
              <p>
                Last checkpoint <code>{run.checkpoint ?? 'Unavailable'}</code> · {run.attempts}{' '}
                recovery attempts
              </p>
            </div>
          </Panel>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            aria-label="Run detail tabs"
            sx={{ my: 2, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab label={`Activity (${events.length})`} />
            <Tab label={`Evidence (${evidence.length})`} />
            <Tab label={`Receipts (${receipts.length})`} />
          </Tabs>
          {tab === 0 && (
            <>
              <div className="swimlane">
                <div>
                  <span className="role-pill worker">Worker</span>
                  <strong>{events.filter((e) => e.role === 'worker').length}</strong>
                  <small>execution events</small>
                </div>
                <div>
                  <span className="role-pill observer">Observer</span>
                  <strong>{events.filter((e) => e.role === 'observer').length}</strong>
                  <small>checks & detections</small>
                </div>
                <div>
                  <span className="role-pill supervisor">Supervisor</span>
                  <strong>{events.filter((e) => e.role === 'supervisor').length}</strong>
                  <small>interventions</small>
                </div>
              </div>
              <LiveLogs events={events} />
            </>
          )}
          {tab === 1 && (
            <Panel title="Source-linked evidence">
              {evidence.map((e) => (
                <article className="evidence-item" key={e.id}>
                  <div className="inline">
                    <FileJson size={17} />
                    <h3>{e.title}</h3>
                    <span className="sample-pill">{e.simulated ? 'Simulated' : 'Captured'}</span>
                  </div>
                  <span className="mono muted">
                    {e.id} · {timestamp(e.createdAt)}
                  </span>
                  <pre>{e.content}</pre>
                  <div className="digest">
                    <Fingerprint size={13} />
                    <code>Captured SHA-256 {e.digest}</code>
                  </div>
                  {e.sourceDigest && (
                    <div className="digest">
                      <code>
                        Source {e.sourcePath} · SHA-256 {e.sourceDigest}
                      </code>
                    </div>
                  )}
                </article>
              ))}
              {!evidence.length && (
                <Empty
                  title="No artifacts captured yet"
                  description="Evidence will appear when the detector or validator records it."
                />
              )}
            </Panel>
          )}
          {tab === 2 && (
            <Panel title="Durable operation receipts">
              {receipts.map((r) => (
                <article className="receipt-item" key={r.id}>
                  <div className="inline spread">
                    <strong>{r.operation.replaceAll('_', ' ')}</strong>
                    <Badge value={r.outcome} />
                  </div>
                  <p>{r.detail}</p>
                  <span className="mono muted">
                    {r.id} · {timestamp(r.timestamp)}
                  </span>
                </article>
              ))}
              {!receipts.length && (
                <Empty
                  title="No operations recorded"
                  description="Stops, validations and recovery decisions produce durable receipts."
                />
              )}
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Result validator">
            <div className="validator-card">
              <Badge value={run.result} />
              <p>
                {run.result === 'validated_pass'
                  ? 'Declared checks passed with an artifact digest and validator receipt.'
                  : run.result === 'validated_fail'
                    ? 'Output failed the declared validator. Inspect evidence before retrying.'
                    : run.result === 'aborted'
                      ? 'Stopped by the operator. No completion is claimed.'
                      : 'Completion is pending independent artifact validation.'}
              </p>
              <DetailRow label="Declared validator">
                {validator === 'exit-code'
                  ? 'Exit code 0'
                  : validator === 'benchmark-json'
                    ? 'Benchmark JSON'
                    : 'None declared'}
              </DetailRow>
              {validator === 'benchmark-json' && (
                <>
                  <DetailRow label="Required accuracy">≥ 0.80</DetailRow>
                  <DetailRow label="Complete cases">
                    {run.progress ?? 'See artifact'} / {run.total ?? 'See artifact'}
                  </DetailRow>
                </>
              )}
              <DetailRow label="Receipt">
                <code>{run.validatorReceiptId ?? 'Not yet issued'}</code>
              </DetailRow>
              <DetailRow label="Artifact">
                <code>{run.artifact ?? 'Not yet captured'}</code>
              </DetailRow>
            </div>
          </Panel>
          <Panel title="Execution boundary">
            <div className="validator-card">
              <DetailRow label="Native session">
                <code>{run.nativeSessionId}</code>
              </DetailRow>
              <DetailRow label="Heartbeat">
                {agent ? <Time value={agent.lastHeartbeat} /> : 'Unknown'}
              </DetailRow>
              <DetailRow label="Known estimates">
                {usage.length ? money(spending) : 'Unknown'}
              </DetailRow>
              <DetailRow label="Resume">Unavailable</DetailRow>
              <pre>{run.command}</pre>
            </div>
          </Panel>
          {run.adapter === 'simulator' && !terminal && (
            <Panel title="Exercise supervision">
              <div className="validator-card">
                <p className="muted">Inject a synthetic incident to inspect the recovery gate.</p>
                {['crash', 'stall', 'evaluation'].map((category) => (
                  <Button
                    key={category}
                    disabled={busy || run.status !== 'running'}
                    fullWidth
                    variant="outlined"
                    color="inherit"
                    startIcon={<TriangleAlert size={14} />}
                    sx={{ mb: 1 }}
                    onClick={() =>
                      action(
                        () => api(`/runs/${run.id}/incident`, { category }),
                        `Simulated ${category} recorded`,
                      )
                    }
                  >
                    Simulate {category}
                  </Button>
                ))}
                {run.status === 'awaiting_approval' && (
                  <Alert severity="warning">
                    Human decision required.
                    <br />
                    <Link to="/approvals">Review recovery proposal →</Link>
                  </Alert>
                )}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
