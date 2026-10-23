import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import { Check, CheckCheck, Fingerprint, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, projectRuns, useConsole } from '../api';
import { Badge, DetailRow, Empty, PageTitle, Panel, Time, timestamp } from '../components/common';
export function Approvals() {
  const c = useConsole();
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const runIds = new Set(projectRuns(c.state, c.projectId).map((r) => r.id));
  const proposals = c.state.proposals.filter(
    (p) =>
      runIds.has(p.runId) &&
      (history || p.status === 'pending') &&
      `${p.id} ${p.action} ${p.runId}`.toLowerCase().includes(c.search.toLowerCase()),
  );
  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    await c.perform(
      () => api(`/proposals/${id}/decision`, { decision }),
      decision === 'approve'
        ? 'Approved with policy receipt; verification remains required'
        : 'Recovery denied; decision recorded',
    );
    setBusy(null);
    setHistory(true);
  }
  return (
    <>
      <PageTitle
        eyebrow="YOU ARE THE FINAL ESCALATION BOUNDARY"
        title="Human approvals"
        description="Review the exact action, scope and evidence before an intervention."
        action={
          <Button variant="outlined" color="inherit" onClick={() => setHistory(!history)}>
            {history ? 'Show pending only' : 'Show decision history'}
          </Button>
        }
      />
      <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3 }}>
        Decisions are durable and policy-checked. Approving this demo only changes the simulated
        worker; it cannot execute shell commands or widen permissions.
      </Alert>
      <div className="approval-list">
        {proposals.map((p) => {
          const run = c.state.runs.find((r) => r.id === p.runId);
          const incident = c.state.incidents.find((i) => i.id === p.incidentId);
          const receipt = c.state.receipts.find((r) => r.id === p.receiptId);
          return (
            <Panel
              key={p.id}
              title="Restart from a verified checkpoint"
              eyebrow={`${p.id} / ${p.incidentId}`}
              action={<Badge value={p.status} />}
            >
              <div className="approval-content">
                <div>
                  <div className="proposal-title">
                    <ShieldCheck size={23} />
                    <div>
                      <h3>{run?.name}</h3>
                      <span className="muted">
                        Proposed by Supervisor · {Math.round(p.confidence * 100)}% diagnosis
                        confidence
                      </span>
                    </div>
                  </div>
                  <p>{p.impact}</p>
                  <div className="command-box">
                    <span className="eyebrow">EXACT SIMULATED ACTION</span>
                    <pre>
                      {JSON.stringify(
                        { action: p.action, target: p.target, parameters: p.parameters },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                  <h3>Evidence considered</h3>
                  {incident?.evidenceIds.map((id) => {
                    const e = c.state.evidence.find((e) => e.id === id);
                    return e ? (
                      <Link className="evidence-link" key={id} to={`/runs/${p.runId}`}>
                        <Fingerprint size={15} />
                        <span>
                          <strong>{e.title}</strong>
                          <small>
                            {id} · {e.digest.slice(0, 16)}…
                          </small>
                        </span>
                        ↗
                      </Link>
                    ) : null;
                  })}
                </div>
                <div className="proposal-policy">
                  <span className="eyebrow">INDEPENDENT POLICY GATE</span>
                  <DetailRow label="Scope">Exact run only</DetailRow>
                  <DetailRow label="Attempts">
                    {run?.attempts} / {c.state.settings.retryLimit}
                  </DetailRow>
                  <DetailRow label="Permission changes">None</DetailRow>
                  <DetailRow label="Restart source">
                    <code>{p.parameters.checkpoint}</code>
                  </DetailRow>
                  <h4>Rollback</h4>
                  <p>{p.rollback}</p>
                  <h4>Post-action verification</h4>
                  <p>{p.verification}</p>
                  <span className="muted">Checkpoint replay is not native session resume.</span>
                </div>
              </div>
              <div className="approval-footer">
                {p.status === 'pending' ? (
                  <>
                    <span>
                      <ShieldCheck size={14} />
                      An approval authorizes one bounded attempt.
                    </span>
                    <div className="button-row">
                      <Button
                        disabled={!!busy}
                        color="inherit"
                        variant="outlined"
                        startIcon={<X size={15} />}
                        onClick={() => decide(p.id, 'reject')}
                      >
                        Reject recovery
                      </Button>
                      <Button
                        disabled={!!busy}
                        variant="contained"
                        startIcon={<Check size={15} />}
                        onClick={() => decide(p.id, 'approve')}
                      >
                        {busy === p.id ? 'Recording…' : 'Approve recovery'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="decision-receipt">
                    <CheckCheck size={18} />
                    <div>
                      <strong>
                        Decision recorded {p.decidedAt && <Time value={p.decidedAt} />}
                      </strong>
                      <p>{receipt?.detail}</p>
                      <code>
                        {receipt?.id} · {receipt && timestamp(receipt.timestamp)}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          );
        })}
        {!proposals.length && (
          <Panel title="Approval queue">
            <Empty
              title={history ? 'No decisions in this project' : 'You’re all caught up'}
              description="New recovery proposals will wait here for your review."
              action={
                <Button component={Link} to="/runs">
                  Explore run supervision
                </Button>
              }
            />
          </Panel>
        )}
      </div>
    </>
  );
}
