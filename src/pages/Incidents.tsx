import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import { ArrowRight, CircleAlert, FileText, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, projectRuns, useConsole } from '../api';
import { Badge, Empty, PageTitle, Panel, Time, timestamp } from '../components/common';
export function Incidents() {
  const c = useConsole();
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = new Set(projectRuns(c.state, c.projectId).map((r) => r.id));
  const incidents = c.state.incidents.filter(
    (i) =>
      ids.has(i.runId) &&
      (filter === 'all' ||
        (filter === 'open' ? i.status !== 'resolved' : i.status === 'resolved')) &&
      `${i.id} ${i.title} ${i.category}`.toLowerCase().includes(c.search.toLowerCase()),
  );
  const incident = incidents.find((i) => i.id === selected) ?? incidents[0];
  return (
    <>
      <PageTitle
        eyebrow="DETECT. INVESTIGATE. VERIFY."
        title="Incidents & recovery"
        description="Typed failures and source-linked evidence, with bounded interventions."
        action={
          <Button
            variant="outlined"
            color="inherit"
            component={Link}
            to="/approvals"
            startIcon={<ShieldCheck size={15} />}
          >
            Review approvals
          </Button>
        }
      />
      <div className="summary-strip">
        <span>
          <strong>{incidents.filter((i) => i.severity === 'critical').length}</strong> critical
        </span>
        <span>
          <strong>{incidents.filter((i) => i.status === 'investigating').length}</strong>{' '}
          investigating
        </span>
        <span className="muted">Acknowledgement does not resolve an incident</span>
      </div>
      <div className="incident-layout">
        <Panel
          title="Incident queue"
          action={
            <select
              aria-label="Incident status filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="open">Open incidents</option>
              <option value="resolved">Resolved</option>
              <option value="all">All incidents</option>
            </select>
          }
        >
          <div className="incident-queue">
            {incidents.map((i) => (
              <button
                className={incident?.id === i.id ? 'selected' : ''}
                onClick={() => setSelected(i.id)}
                key={i.id}
              >
                <div className="inline spread">
                  <span className="eyebrow">{i.id}</span>
                  <Badge value={i.severity} />
                </div>
                <h3>{i.title}</h3>
                <p>{c.state.runs.find((r) => r.id === i.runId)?.name}</p>
                <div className="inline spread">
                  <Badge value={i.status} />
                  <Time value={i.updatedAt} />
                </div>
              </button>
            ))}
          </div>
          {!incidents.length && (
            <Empty
              title="No matching incidents"
              description="Open a running simulation to exercise a detector."
              action={
                <Button component={Link} to="/runs">
                  View runs
                </Button>
              }
            />
          )}
        </Panel>
        {incident ? (
          <Panel title="Investigation" action={<Badge value={incident.status} />}>
            <div className="investigation">
              <div className="incident-heading">
                <span className="attention-icon">
                  <CircleAlert size={21} />
                </span>
                <div>
                  <span className="eyebrow">
                    {incident.category.toUpperCase()} / {incident.id}
                  </span>
                  <h2>{incident.title}</h2>
                  <small className="muted">
                    Detected {timestamp(incident.createdAt)} · updated{' '}
                    <Time value={incident.updatedAt} />
                  </small>
                </div>
              </div>
              <h3>Diagnosis</h3>
              <p>{incident.diagnosis}</p>
              <h3>Detection evidence</h3>
              {incident.evidenceIds.map((id) => {
                const e = c.state.evidence.find((e) => e.id === id);
                return e ? (
                  <div className="subtle-box" key={id}>
                    <div className="inline">
                      <FileText size={15} />
                      <strong>{e.title}</strong>
                    </div>
                    <pre>{e.content}</pre>
                    <small className="mono">
                      {e.id} · SHA-256 {e.digest.slice(0, 20)}…
                    </small>
                  </div>
                ) : null;
              })}
              <h3>Recovery boundary</h3>
              <Alert severity={incident.status === 'resolved' ? 'success' : 'warning'}>
                {incident.status === 'resolved'
                  ? 'The run completed and passed its declared validator.'
                  : 'A proposed intervention does not authorize execution. The policy gate checks exact target, checkpoint and remaining attempts.'}
              </Alert>
              <div className="button-row">
                <Button
                  disabled={busy || ['acknowledged', 'resolved'].includes(incident.status)}
                  variant="outlined"
                  color="inherit"
                  onClick={async () => {
                    setBusy(true);
                    await c.perform(
                      () => api(`/incidents/${incident.id}/acknowledge`, {}),
                      'Acknowledgement recorded',
                    );
                    setBusy(false);
                  }}
                >
                  Acknowledge
                </Button>
                <Button
                  variant="contained"
                  component={Link}
                  to="/approvals"
                  endIcon={<ArrowRight size={15} />}
                >
                  Inspect proposal
                </Button>
                <Button component={Link} to={`/runs/${incident.runId}`}>
                  View run evidence
                </Button>
              </div>
            </div>
          </Panel>
        ) : (
          <div className="panel">
            <Empty
              title="No investigation selected"
              description="Incidents will appear when a detector records evidence."
            />
          </div>
        )}
      </div>
    </>
  );
}
