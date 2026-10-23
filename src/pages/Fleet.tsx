import { useState } from 'react';
import { Button, Drawer, IconButton } from '@mui/material';
import { ArrowDownUp, ArrowRight, Check, Cpu, LayoutGrid, List, Shield, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Agent } from '../../shared/types';
import { runtimeLabel } from '../../shared/types';
import { useConsole } from '../api';
import { Badge, DetailRow, Empty, PageTitle, Panel, RuntimeIcon, Time } from '../components/common';
export function Fleet() {
  const { state, projectId, search } = useConsole();
  const [role, setRole] = useState('all');
  const [health, setHealth] = useState('all');
  const [sort, setSort] = useState<'name' | 'role' | 'runtime'>('name');
  const [desc, setDesc] = useState(false);
  const [tiles, setTiles] = useState(false);
  const [selected, setSelected] = useState<Agent | null>(null);
  const agents = state.agents
    .filter(
      (a) =>
        (projectId === 'all' || a.projectId === projectId) &&
        (role === 'all' || a.role === role) &&
        (health === 'all' || a.status === health) &&
        `${a.name} ${a.runtime} ${a.role}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => (desc ? -1 : 1) * a[sort].localeCompare(b[sort]));
  const selectedFresh = state.agents.find((a) => a.id === selected?.id) ?? selected;
  function sorting(key: typeof sort) {
    if (key === sort) setDesc(!desc);
    else {
      setSort(key);
      setDesc(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="PROVIDER-INDEPENDENT BY DESIGN"
        title="Agent fleet"
        description="Workers execute. Observers watch. Supervisors propose."
        action={
          <Button
            variant="outlined"
            color="inherit"
            component={Link}
            to="/settings"
            startIcon={<Cpu size={15} />}
          >
            Manage adapters
          </Button>
        }
      />
      <div className="summary-strip">
        <span>
          <strong>{agents.length}</strong> registered agents
        </span>
        <span>
          <i className="tiny-dot" />
          <strong>{agents.filter((a) => a.status === 'healthy').length}</strong> healthy
        </span>
        <span>
          <i className="tiny-dot amber" />
          <strong>{agents.filter((a) => a.status === 'degraded').length}</strong> degraded
        </span>
        <span className="muted">All displayed agents are simulated</span>
      </div>
      <Panel
        title="Registered agents"
        action={
          <div className="inline">
            <IconButton
              aria-label="Table view"
              onClick={() => setTiles(false)}
              color={!tiles ? 'primary' : 'default'}
            >
              <List size={17} />
            </IconButton>
            <IconButton
              aria-label="Tile view"
              onClick={() => setTiles(true)}
              color={tiles ? 'primary' : 'default'}
            >
              <LayoutGrid size={17} />
            </IconButton>
          </div>
        }
      >
        <div className="table-toolbar">
          <select aria-label="Filter role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">All roles</option>
            {['worker', 'observer', 'supervisor'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select
            aria-label="Filter health"
            value={health}
            onChange={(e) => setHealth(e.target.value)}
          >
            <option value="all">All health states</option>
            {['healthy', 'degraded', 'idle', 'unknown'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <span className="muted">{agents.length} results</span>
        </div>
        {tiles ? (
          <div className="agent-tiles">
            {agents.map((a) => (
              <button key={a.id} className="agent-tile" onClick={() => setSelected(a)}>
                <RuntimeIcon runtime={a.runtime} size={36} />
                <Badge value={a.status} />
                <h3>{a.name}</h3>
                <p>
                  {a.role} · {runtimeLabel(a.runtime)}
                </p>
                <span className="muted">
                  Heartbeat <Time value={a.lastHeartbeat} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(['name', 'role', 'runtime'] as const).map((key) => (
                    <th key={key}>
                      <button className="sort-button" onClick={() => sorting(key)}>
                        {key === 'name' ? 'Agent' : key}
                        <ArrowDownUp size={11} />
                      </button>
                    </th>
                  ))}
                  <th>Health</th>
                  <th>Heartbeat</th>
                  <th>Permission</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button className="agent-name" onClick={() => setSelected(a)}>
                        <RuntimeIcon runtime={a.runtime} />
                        <span>
                          <strong>{a.name}</strong>
                          <small>{a.sessionId}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`role-pill ${a.role}`}>{a.role}</span>
                    </td>
                    <td>
                      {runtimeLabel(a.runtime)}
                      <small>{a.model}</small>
                    </td>
                    <td>
                      <Badge value={a.status} />
                    </td>
                    <td>
                      <Time value={a.lastHeartbeat} />
                      {Date.now() - Date.parse(a.lastHeartbeat) >
                        state.settings.staleAfterSeconds * 1000 &&
                        a.status !== 'idle' && <small className="warning-text">Stale signal</small>}
                    </td>
                    <td>
                      <span className="permission">
                        <Shield size={12} />
                        {a.role === 'observer'
                          ? 'Read-only'
                          : a.role === 'supervisor'
                            ? 'Propose-only'
                            : 'Bounded tools'}
                      </span>
                    </td>
                    <td>
                      <IconButton aria-label={`Inspect ${a.name}`} onClick={() => setSelected(a)}>
                        <ArrowRight size={15} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!agents.length && (
          <Empty
            title="No agents match"
            description="Adjust the role, health or workspace search filters."
          />
        )}
        <div className="panel-foot">
          Capabilities describe this adapter. Missing native controls are never inferred.
        </div>
      </Panel>
      <Drawer
        anchor="right"
        open={!!selectedFresh}
        onClose={() => setSelected(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 470 }, p: 3 } }}
      >
        {selectedFresh && (
          <>
            <div className="drawer-title">
              <RuntimeIcon runtime={selectedFresh.runtime} size={38} />
              <div>
                <span className="eyebrow">AGENT DETAILS · SIMULATED</span>
                <h2>{selectedFresh.name}</h2>
              </div>
              <IconButton aria-label="Close agent details" onClick={() => setSelected(null)}>
                <X size={19} />
              </IconButton>
            </div>
            <Badge value={selectedFresh.status} />
            <div className="detail-section">
              <DetailRow label="Role">{selectedFresh.role}</DetailRow>
              <DetailRow label="Runtime">{runtimeLabel(selectedFresh.runtime)}</DetailRow>
              <DetailRow label="Native session">
                <code>{selectedFresh.sessionId}</code>
              </DetailRow>
              <DetailRow label="Last heartbeat">
                <Time value={selectedFresh.lastHeartbeat} />
              </DetailRow>
              <DetailRow label="Effective permission">
                {selectedFresh.role === 'worker'
                  ? 'Bounded execution'
                  : selectedFresh.role === 'observer'
                    ? 'Read-only'
                    : 'Propose-only'}
              </DetailRow>
            </div>
            <h3>Effective capabilities</h3>
            <p className="muted">Only controls exposed by the adapter are available.</p>
            {Object.entries(selectedFresh.capabilities).map(([key, enabled]) => (
              <DetailRow label={key.replace(/([A-Z])/g, ' $1')} key={key}>
                <span className={enabled ? 'success-text' : 'muted'}>
                  {enabled ? <Check size={13} /> : <X size={13} />}{' '}
                  {enabled ? 'Available' : 'Unavailable'}
                </span>
              </DetailRow>
            ))}
            <div className="subtle-box">
              <strong>Running is not proof of progress</strong>
              <p>
                Heartbeat, checkpoint and validator evidence are evaluated separately. Simulated
                adapters do not provide native provider resume.
              </p>
            </div>
            <Button
              component={Link}
              to="/runs"
              onClick={() => setSelected(null)}
              endIcon={<ArrowRight size={15} />}
            >
              Inspect project runs
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
