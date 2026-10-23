import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import {
  Activity,
  ArrowUpRight,
  Blocks,
  Bot,
  CheckCheck,
  Network,
  PlugZap,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, useConsole } from '../api';
import type { Diagnostic } from '../../shared/types';
import { Badge, DetailRow, PageTitle, Panel, timestamp } from '../components/common';
const config = {
  memory: {
    name: 'AtMem',
    title: 'Governed memory',
    eyebrow: 'CONTEXT WITH BOUNDARIES',
    description: 'Source-linked memory with scope, provenance and governed admission.',
    Icon: Blocks,
    features: [
      'Project-scoped context packs',
      'Admission & quarantine',
      'Recall decisions & provenance',
      'Sessions, decisions & audit',
    ],
    docs: 'https://atmem.ai/docs/reference/dashboard',
  },
  observability: {
    name: 'AtFlows',
    title: 'Observability',
    eyebrow: 'TRACES WITHOUT HIDDEN ASSUMPTIONS',
    description: 'Correlate agent sessions, tool spans and cost records.',
    Icon: Network,
    features: [
      'Activity & execution timeline',
      'OTLP trace ingestion',
      'Invocation cost correlation',
      'Telemetry coverage diagnostics',
    ],
    docs: 'https://atmem.ai/docs/getting-started/atflows',
  },
  atbot: {
    name: 'AtBot',
    title: 'Intelligence companion',
    eyebrow: 'ASSISTANCE, WITH CLEAR AUTHORITY',
    description: 'An optional memory companion, independent from agent runtime roles.',
    Icon: Bot,
    features: [
      'Memory proposal outcomes',
      'Provider & model diagnostics',
      'Companion invocation costs',
      'AtMem-managed setup',
    ],
    docs: 'https://atmem.ai/docs/getting-started/atbot',
  },
};
export function Integrations({ kind }: { kind: keyof typeof config }) {
  const c = useConsole();
  const cfg = config[kind];
  const [testing, setTesting] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);
  async function test() {
    setTesting(true);
    const diagnostics = await c.perform(
      () => api<Diagnostic[]>('/doctor'),
      'Local availability checked; companion transport is not connected',
    );
    if (diagnostics) {
      setDetected(diagnostics.find((d) => d.runtime === 'atbot')?.installed ?? false);
      setChecked(new Date().toISOString());
    }
    setTesting(false);
  }
  return (
    <>
      <PageTitle
        eyebrow={cfg.eyebrow}
        title={cfg.title}
        description={cfg.description}
        action={
          <Button
            variant="outlined"
            color="inherit"
            component="a"
            href={cfg.docs}
            target="_blank"
            rel="noreferrer"
            endIcon={<ArrowUpRight size={14} />}
          >
            Companion documentation
          </Button>
        }
      />
      <div className="integration-hero">
        <span className="integration-icon">
          <cfg.Icon size={34} />
        </span>
        <div>
          <span className="eyebrow">OPTIONAL COMPANION</span>
          <h2>{cfg.name} is off</h2>
          <p>
            Your agents, incidents, approvals and results work independently.
            <br />
            No data is sent to this companion.
          </p>
        </div>
        <Badge value="unavailable" />
      </div>
      <div className="two-columns">
        <Panel title="Connection status" action={<span className="off-pill">Off by default</span>}>
          <div className="integration-body">
            <DetailRow label="Effective mode">Off</DetailRow>
            <DetailRow label="Transport">Not configured</DetailRow>
            <DetailRow label="Health">Unavailable</DetailRow>
            <DetailRow label="Native dashboard">Not discovered</DetailRow>
            <DetailRow label="Last checked">
              {checked ? timestamp(checked) : 'Not yet checked'}
            </DetailRow>
            {checked && (
              <Alert severity="info" sx={{ my: 2 }}>
                {kind === 'atbot' && detected
                  ? 'AtBot executable detected.'
                  : 'No active companion transport configured.'}{' '}
                Live health, authentication and dashboard URL remain unverified.
              </Alert>
            )}
            <Button
              variant="outlined"
              color="inherit"
              disabled={testing}
              onClick={test}
              startIcon={<PlugZap size={15} />}
            >
              {testing ? 'Checking…' : 'Check local availability'}
            </Button>
            <p className="muted">
              This checks local availability only. A working connector is required before
              instrumentation can be healthy.
            </p>
          </div>
        </Panel>
        <Panel title="Available when connected">
          <div className="integration-body">
            {cfg.features.map((f) => (
              <div className="integration-feature" key={f}>
                <CheckCheck size={17} />
                <span>{f}</span>
                <span className="off-pill">Unavailable</span>
              </div>
            ))}
            <div className="subtle-box">
              <ShieldCheck size={17} />
              <strong>Native permissions stay native</strong>
              <p>
                Dashboard links will be resolved from verified status discovery. Shortcuts do not
                grant access or operational authority.
              </p>
            </div>
          </div>
        </Panel>
      </div>
      {kind === 'memory' && (
        <Panel title="Memory and evidence are separate">
          <div className="integration-body">
            <div className="two-columns">
              <div>
                <h3>Evidence</h3>
                <p>
                  Raw observations, artifact digests, checkpoints and decisions remain in the local
                  AtSys record.
                </p>
                <Button component={Link} to="/runs" endIcon={<ArrowUpRight size={13} />}>
                  Inspect run evidence
                </Button>
              </div>
              <div>
                <h3>Learned memory</h3>
                <p>
                  Admission, quarantine, correction and scoped recall belong to AtMem. Capturing
                  evidence never implies memory acceptance.
                </p>
                <Badge value="unavailable" />
              </div>
            </div>
          </div>
        </Panel>
      )}
      {kind === 'observability' && (
        <Panel title="Control plane telemetry">
          <div className="integration-body">
            <div className="summary-strip">
              <span>
                <Activity size={16} />
                <strong>{c.state.events.length}</strong> local normalized events
              </span>
              <span>
                <strong>Unknown</strong> external trace coverage
              </span>
              <span>
                <strong>0</strong> connected collectors
              </span>
            </div>
            <p className="muted">
              The local event stream is not an AtFlows connection. Installing a companion alone does
              not prove instrumentation.
            </p>
          </div>
        </Panel>
      )}
    </>
  );
}
