import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, Fingerprint } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useConsole, projectRuns } from '../api';
import { Empty, PageTitle, Panel, Time, money } from '../components/common';
import { runtimeLabel } from '../../shared/types';
export function Costs() {
  const { state, projectId, range, search } = useConsole();
  const runIds = new Set(projectRuns(state, projectId).map((r) => r.id));
  const usage = state.usage.filter(
    (u) =>
      runIds.has(u.runId) &&
      Date.now() - Date.parse(u.timestamp) < range * 86400000 &&
      `${u.runtime} ${u.role} ${u.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const total = usage.reduce((s, u) => s + (u.amount ?? 0), 0);
  const unpriced = usage.filter((u) => u.amount === null).length;
  const budget =
    projectId === 'all'
      ? state.settings.dailyBudget
      : (state.projects.find((p) => p.id === projectId)?.budget ?? state.settings.dailyBudget);
  const byProvider = [...new Set(usage.map((u) => u.runtime))].map((runtime) => ({
    name: runtimeLabel(runtime),
    Worker: usage
      .filter((u) => u.runtime === runtime && u.role === 'worker')
      .reduce((s, u) => s + (u.amount ?? 0), 0),
    Supervisor: usage
      .filter((u) => u.runtime === runtime && u.role === 'supervisor')
      .reduce((s, u) => s + (u.amount ?? 0), 0),
  }));
  const chart = Array.from({ length: range === 1 ? 12 : range }, (_, i) => {
    const start =
      Date.now() - (range === 1 ? (12 - i) * 2 : range - i) * 3600000 * (range === 1 ? 1 : 24);
    const end = start + (range === 1 ? 2 : 24) * 3600000;
    return {
      time:
        range === 1
          ? new Date(start).toLocaleTimeString('en-US', { hour: 'numeric' })
          : new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: usage
        .filter((u) => Date.parse(u.timestamp) >= start && Date.parse(u.timestamp) < end)
        .reduce((s, u) => s + (u.amount ?? 0), 0),
    };
  });
  return (
    <>
      <PageTitle
        eyebrow="COSTS WITH PROVENANCE"
        title="Costs & usage"
        description="Know what is measured, what is estimated and what is still unknown."
      />
      <div className="cost-notice">
        <Fingerprint size={18} />
        <span>
          Illustrative sample usage. These amounts are not actual provider charges. Unknown prices
          remain unknown.
        </span>
      </div>
      <div className="metric-grid four">
        {[
          {
            label: 'Known estimates',
            value: usage.length ? money(total) : 'Unknown',
            detail: 'USD · illustrative fixture rates',
          },
          {
            label: 'Budget utilization',
            value: usage.length ? `${Math.round((total / budget) * 100)}%` : 'Unknown',
            detail: `${money(budget)} configured project budget`,
          },
          {
            label: 'Input / output tokens',
            value: `${(usage.reduce((s, u) => s + u.inputTokens + u.outputTokens, 0) / 1000).toFixed(1)}k`,
            detail: 'Simulated token counts',
          },
          {
            label: 'Pricing coverage',
            value: usage.length
              ? `${Math.round(((usage.length - unpriced) / usage.length) * 100)}%`
              : 'Unknown',
            detail: `${unpriced} unpriced invocation${unpriced === 1 ? '' : 's'}`,
          },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <div className="metric-label">{m.label}</div>
            <strong>{m.value}</strong>
            <div className="metric-detail">{m.detail}</div>
          </div>
        ))}
      </div>
      <div className="two-columns">
        <Panel title="Spend over time" eyebrow="KNOWN ESTIMATES · USD">
          <div className="big-chart">
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={chart} margin={{ left: 0, right: 18, top: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c9d63" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#7c9d63" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#dce2d6" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  minTickGap={30}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="amount"
                  stroke="#6e9359"
                  strokeWidth={2}
                  fill="url(#costFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="panel-foot">Click a source record below to inspect its run.</div>
        </Panel>
        <Panel title="Runtime & role" eyebrow="SINGLE INVOCATION, SINGLE RECORD">
          <div className="big-chart">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={byProvider} margin={{ left: 0, right: 20, top: 20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#dce2d6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  isAnimationActive={false}
                  dataKey="Worker"
                  stackId="a"
                  fill="#79966a"
                  maxBarSize={48}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="Supervisor"
                  stackId="a"
                  fill="#c3cea5"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="panel-foot">
            Observer is deterministic; no modeled charges are inferred.
          </div>
        </Panel>
      </div>
      <Panel
        title="Source invocation records"
        action={<span className="eyebrow">{usage.length} DEDUPLICATED RECORDS</span>}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invocation / run</th>
                <th>Runtime</th>
                <th>Role</th>
                <th>Tokens in / out</th>
                <th>Amount (USD)</th>
                <th>Provenance</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link className="table-main-link" to={`/runs/${u.runId}`}>
                      {u.invocationId}
                      <ArrowUpRight size={12} />
                    </Link>
                    <small>{u.runId}</small>
                  </td>
                  <td>{runtimeLabel(u.runtime)}</td>
                  <td>{u.role}</td>
                  <td className="mono">
                    {u.inputTokens.toLocaleString()} / {u.outputTokens.toLocaleString()}
                  </td>
                  <td>
                    <strong className={u.amount === null ? 'warning-text' : ''}>
                      {u.amount === null ? 'Unknown' : money(u.amount)}
                    </strong>
                    <small>{u.amount === null ? 'Unpriced' : 'Illustrative estimate'}</small>
                  </td>
                  <td>
                    {u.source}
                    <small>Pricing date: {u.pricingDate ?? 'Unavailable · sample'}</small>
                  </td>
                  <td>
                    <Time value={u.timestamp} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!usage.length && (
          <Empty
            title="No cost records in this window"
            description="Costs for uninstrumented tasks remain unknown."
          />
        )}
      </Panel>
    </>
  );
}
