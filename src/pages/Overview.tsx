import { Button } from '@mui/material';
import {
  Activity,
  ArrowRight,
  CheckCheck,
  CircleAlert,
  Clock3,
  GitBranch,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
  Workflow,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useConsole, projectRuns } from '../api';
import {
  Badge,
  Empty,
  PageTitle,
  Panel,
  Progress,
  RuntimeIcon,
  Time,
  ViewLink,
  money,
} from '../components/common';
import { LiveLogs } from '../components/LiveLogs';
export function Overview({ onNewRun }: { onNewRun: () => void }) {
  const { state, projectId, search, range, online } = useConsole();
  const runs = projectRuns(state, projectId);
  const runIds = new Set(runs.map((r) => r.id));
  const agents = state.agents.filter((a) => projectId === 'all' || a.projectId === projectId);
  const incidents = state.incidents.filter((i) => runIds.has(i.runId) && i.status !== 'resolved');
  const approvals = state.proposals.filter((p) => runIds.has(p.runId) && p.status === 'pending');
  const active = runs.filter((r) => ['running', 'awaiting_approval'].includes(r.status));
  const usage = state.usage.filter(
    (u) => runIds.has(u.runId) && Date.now() - Date.parse(u.timestamp) < range * 86400000,
  );
  const spend = usage.reduce((sum, u) => sum + (u.amount ?? 0), 0);
  const unknown = usage.filter((u) => u.amount === null).length;
  const budget =
    projectId === 'all'
      ? state.settings.dailyBudget
      : (state.projects.find((p) => p.id === projectId)?.budget ?? state.settings.dailyBudget);
  const events = state.events.filter((e) => runIds.has(e.runId));
  const main = active.find((r) => r.status === 'running') ?? active[0];
  const trend = Array.from({ length: 8 }, (_, i) => ({
    hour: `${i * 3}:00`,
    amount: usage
      .filter(
        (u) =>
          new Date(u.timestamp).getHours() >= i * 3 &&
          new Date(u.timestamp).getHours() < (i + 1) * 3,
      )
      .reduce((s, u) => s + (u.amount ?? 0), 0),
  }));
  const metrics = [
    {
      label: 'Active agents',
      value: agents.filter((a) => a.status === 'healthy').length,
      detail: `${agents.length} registered · ${agents.filter((a) => a.status === 'degraded').length} degraded`,
      Icon: Activity,
      tone: 'green',
    },
    {
      label: 'Open incidents',
      value: incidents.length.toString().padStart(2, '0'),
      detail: incidents.length ? 'Needs your attention' : 'No open incidents',
      Icon: CircleAlert,
      tone: incidents.length ? 'amber' : 'green',
      to: '/incidents',
    },
    {
      label: 'Awaiting approval',
      value: approvals.length.toString().padStart(2, '0'),
      detail: approvals.length ? 'Recovery proposal ready' : 'You’re all caught up',
      Icon: ShieldCheck,
      tone: approvals.length ? 'amber' : 'green',
      to: '/approvals',
    },
    {
      label: 'Verified runs',
      value: runs
        .filter((r) => r.result === 'validated_pass')
        .length.toString()
        .padStart(2, '0'),
      detail: `${runs.length} total · artifact-backed results`,
      Icon: CheckCheck,
      tone: 'green',
      to: '/runs',
    },
    {
      label: 'Estimated spend',
      value: usage.length ? money(spend) : 'Unknown',
      detail: !usage.length
        ? 'No pricing records collected'
        : unknown
          ? `${unknown} unpriced calls · USD`
          : `of ${money(budget)} budget · USD`,
      Icon: Wallet,
      tone: 'neutral',
      to: '/costs',
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title="Project overview"
        description="Keep your agents moving. Know when to step in."
        action={
          <>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<Workflow size={15} />}
              component={Link}
              to="/runs"
            >
              View runs
            </Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={onNewRun}>
              New run
            </Button>
          </>
        }
      />
      <div className="overview-notice">
        <span className="notice-icon">
          <Sparkles size={14} />
        </span>
        <span>
          <strong>A safe place to explore.</strong> This workspace contains simulated agents and
          events. Try a supervised run to see the full lifecycle.
        </span>
        <button onClick={onNewRun}>
          Try a run <ArrowRight size={14} />
        </button>
      </div>
      <div className="metric-grid">
        {metrics.map(({ label, value, detail, Icon, tone, to }) => (
          <Link className={`metric-card ${tone}`} to={to ?? '/fleet'} key={label}>
            <div className="metric-label">
              {label}
              <Icon size={15} />
            </div>
            <strong>{value}</strong>
            <div className="metric-detail">
              <span className="tiny-dot" />
              {detail}
            </div>
          </Link>
        ))}
      </div>
      <div className="overview-grid">
        <div className="overview-main">
          <Panel
            title="Supervision topology"
            eyebrow="INDEPENDENT ROLES. SHARED OBJECTIVE."
            action={
              <span className="live-label">
                <i />
                {online ? 'Control plane active' : 'Snapshot · disconnected'}
              </span>
            }
          >
            <div className="topology">
              <div className="topology-line" />
              {[
                {
                  role: 'Worker',
                  subtitle: 'Executes the task',
                  runtime:
                    main?.runtime ?? agents.find((a) => a.role === 'worker')?.runtime ?? 'custom',
                  name: agents.some((a) => a.role === 'worker') ? 'Coding agent' : 'Not configured',
                  permission: agents.some((a) => a.role === 'worker')
                    ? 'Bounded execution'
                    : 'Unavailable',
                  icon: Play,
                },
                {
                  role: 'Observer',
                  subtitle: 'Watches the evidence',
                  runtime: agents.find((a) => a.role === 'observer')?.runtime ?? 'custom',
                  name: agents.some((a) => a.role === 'observer')
                    ? 'Deterministic rules'
                    : 'Not configured',
                  permission: agents.some((a) => a.role === 'observer')
                    ? 'Read-only'
                    : 'Unavailable',
                  icon: Activity,
                },
                {
                  role: 'Supervisor',
                  subtitle: 'Proposes recovery',
                  runtime: agents.find((a) => a.role === 'supervisor')?.runtime ?? 'custom',
                  name: agents.some((a) => a.role === 'supervisor')
                    ? 'Reasoning agent'
                    : 'Not configured',
                  permission: agents.some((a) => a.role === 'supervisor')
                    ? 'Propose-only'
                    : 'Unavailable',
                  icon: ShieldCheck,
                },
              ].map(({ role, subtitle, runtime, name, permission }, i) => (
                <Link to="/fleet" className={`topology-node node-${i}`} key={role}>
                  <div className="node-top">
                    <span className="eyebrow">
                      0{i + 1} / {role.toUpperCase()}
                    </span>
                    <span className="tiny-dot" />
                  </div>
                  <div className="node-name">
                    <RuntimeIcon runtime={runtime} size={32} />
                    <div>
                      <strong>{name}</strong>
                      <small>{subtitle}</small>
                    </div>
                  </div>
                  <div className="node-footer">
                    <span>{permission}</span>
                    <ArrowRight size={13} />
                  </div>
                </Link>
              ))}
            </div>
            <div className="topology-caption">
              <ShieldCheck size={13} />
              <span>Deterministic control plane</span>
              <span className="caption-line" />
              <span>Policy gate</span>
              <ArrowRight size={12} />
              <strong>Human approval</strong>
            </div>
          </Panel>
          <Panel title="Active runs" action={<ViewLink to="/runs" />}>
            <div className="active-runs">
              {active
                .filter((r) =>
                  `${r.name} ${r.runtime}`.toLowerCase().includes(search.toLowerCase()),
                )
                .map((r) => (
                  <Link className="active-run" to={`/runs/${r.id}`} key={r.id}>
                    <RuntimeIcon runtime={r.runtime} size={33} />
                    <div className="run-summary">
                      <div>
                        <strong>{r.name}</strong>
                        <Badge value={r.status} />
                      </div>
                      <small>
                        <span className="mono">{r.id}</span>
                        <span>·</span>
                        <Clock3 size={12} />
                        <Time value={r.startedAt} />
                        <span>·</span>
                        <GitBranch size={12} />
                        {state.projects.find((p) => p.id === r.projectId)?.branch}
                      </small>
                      <Progress value={r.progress} total={r.total} />
                    </div>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              {!active.length && (
                <Empty
                  title="No active runs"
                  description="Start a new simulation to explore supervision."
                  action={<Button onClick={onNewRun}>New run</Button>}
                />
              )}
            </div>
            <div className="panel-foot">
              <span>
                <span className="tiny-dot" />
                Status is evidence-based. Running does not imply validated progress.
              </span>
            </div>
          </Panel>
          <LiveLogs events={events} compact />
        </div>
        <div className="overview-rail">
          <Panel
            title="Attention queue"
            action={<span className="count-badge">{incidents.length + approvals.length}</span>}
          >
            <div className="attention-list">
              {incidents.map((i) => (
                <Link key={i.id} to="/incidents" className="attention-item">
                  <span className="attention-icon">
                    <CircleAlert size={16} />
                  </span>
                  <div>
                    <div className="inline">
                      <span className="eyebrow">{i.severity.toUpperCase()}</span>
                      <span className="muted">
                        · <Time value={i.updatedAt} />
                      </span>
                    </div>
                    <strong>{i.title}</strong>
                    <p>{state.runs.find((r) => r.id === i.runId)?.name}</p>
                    <span className="attention-link">
                      Inspect incident <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              ))}
              {approvals.map((p) => (
                <Link key={p.id} to="/approvals" className="attention-item approval">
                  <span className="attention-icon">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <span className="eyebrow">HUMAN DECISION</span>
                    <strong>Checkpoint restart proposed</strong>
                    <p>Exact target and evidence are ready for review.</p>
                    <span className="attention-link">
                      Review proposal <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              ))}
              {!incidents.length && !approvals.length && (
                <div className="all-clear">
                  <ShieldCheck size={24} />
                  <strong>All clear for now</strong>
                  <p>New incidents will appear here.</p>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Spend & budget" action={<ViewLink to="/costs">Details</ViewLink>}>
            <div className="spend-summary">
              <strong>{usage.length ? money(spend) : 'Unknown'}</strong>
              <span>
                {' '}
                / {money(budget)}
                <br />
                <small>illustrative estimate · USD</small>
              </span>
            </div>
            <div className="budget-track">
              <div style={{ width: `${Math.min(100, (spend / budget) * 100)}%` }} />
            </div>
            <div className="budget-caption">
              <span>
                {usage.length
                  ? `${Math.round((spend / budget) * 100)}% of project budget`
                  : 'Usage not instrumented'}
              </span>
              <span>
                {!usage.length ? 'Unknown' : unknown ? `${unknown} unpriced` : 'Sample usage'}
              </span>
            </div>
            <div className="mini-chart">
              <ResponsiveContainer width="100%" height={94}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#819f67" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#819f67" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="hour"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: '#899082' }}
                    interval={2}
                  />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="amount"
                    stroke="#789761"
                    strokeWidth={2}
                    fill="url(#spendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Companion services" action={<span className="eyebrow">OPTIONAL</span>}>
            <div className="companion-list">
              {[
                ['Memory', 'AtMem', 'Governed, scoped context', '/memory'],
                ['Telemetry', 'AtFlows', 'Traces & cost correlation', '/observability'],
                ['Intelligence', 'AtBot', 'Memory assistance', '/atbot'],
              ].map(([label, name, desc, to]) => (
                <Link key={name} to={to}>
                  <span className="companion-symbol">{name.slice(2, 3)}</span>
                  <div>
                    <strong>
                      {name}
                      <span>{label}</span>
                    </strong>
                    <small>{desc}</small>
                  </div>
                  <span className="off-pill">Off</span>
                </Link>
              ))}
            </div>
            <div className="panel-foot">Core supervision works independently.</div>
          </Panel>
        </div>
      </div>
      <div className="overview-bottom-note">
        <ShieldCheck size={14} />
        <span>Built for long runs and clear decisions.</span>
        <span>Every intervention leaves a receipt.</span>
      </div>
    </>
  );
}
