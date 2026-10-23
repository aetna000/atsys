import { useConsole } from '../api';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Pause, Play, Search, Terminal } from 'lucide-react';
import { Button, Tooltip } from '@mui/material';
import type { AgentEvent } from '../../shared/types';
import { Panel, Empty } from './common';
export function LiveLogs({ events, compact = false }: { events: AgentEvent[]; compact?: boolean }) {
  const { online } = useConsole();
  const [paused, setPaused] = useState<AgentEvent[] | null>(null);
  const [query, setQuery] = useState('');
  const visible = (paused ?? events)
    .filter((e) => `${e.message} ${e.type} ${e.role}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, compact ? 6 : 80);
  return (
    <Panel
      title="Event stream"
      eyebrow="OBSERVATIONS, WITH EVIDENCE"
      className="logs-panel"
      action={
        <div className="inline">
          <span className={`live-label ${paused ? 'paused' : ''}`}>
            <i />
            {paused ? 'Paused' : online ? 'Live' : 'Stale'}
          </span>
          <Tooltip title={paused ? 'Resume event stream' : 'Pause event stream'}>
            <Button
              size="small"
              aria-label={paused ? 'Resume logs' : 'Pause logs'}
              onClick={() => setPaused(paused ? null : [...events])}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </Button>
          </Tooltip>
        </div>
      }
    >
      <div className="log-toolbar">
        <Terminal size={14} />
        <span>All roles</span>
        <div className="log-search">
          <Search size={13} />
          <input
            aria-label="Search events"
            placeholder="Filter events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className={`logs ${compact ? 'compact' : ''}`}>
        {visible.map((e) => (
          <div className={`log-row ${e.severity}`} key={e.id}>
            <time title={e.timestamp}>{new Date(e.timestamp).toLocaleTimeString('en-GB')}</time>
            <span className={`log-role ${e.role}`}>{e.role.slice(0, 3).toUpperCase()}</span>
            <span title={e.type}>{e.message.replace('[SIMULATION] ', '')}</span>
            {e.evidenceIds.length > 0 && (
              <Link
                className="log-evidence"
                title={e.evidenceIds.join(', ')}
                to={`/runs/${e.runId}?tab=evidence`}
              >
                evidence ↗
              </Link>
            )}
          </div>
        ))}
        {!visible.length && (
          <Empty title="No matching events" description="Change the event filter to see more." />
        )}
      </div>
      <div className="panel-foot">
        <span>
          {events.length} captured events ·{' '}
          {paused ? 'Display paused; ingestion continues' : 'Polling every 2 seconds'}
        </span>
        <span className="mono">schema v1</span>
      </div>
    </Panel>
  );
}
