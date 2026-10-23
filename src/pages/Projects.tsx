import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { ArrowUpRight, FolderGit2, GitBranch, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, useConsole } from '../api';
import { Badge, Empty, PageTitle, Time, money } from '../components/common';
export function Projects() {
  const { state, search, perform, selectProject } = useConsole();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const result = await perform(
      () => api('/projects', { name, path }),
      'Project registered; repository files unchanged',
    );
    setBusy(false);
    if (result) {
      setOpen(false);
      setName('');
      setPath('');
    }
  }
  const projects = state.projects.filter((p) =>
    `${p.name} ${p.path}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="ATTACH. SUPERVISE. KEEP BUILDING."
        title="Projects"
        description="An unobtrusive supervision layer around your repositories."
        action={
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
            Add project
          </Button>
        }
      />
      <div className="project-grid">
        {projects.map((p) => {
          const runs = state.runs.filter((r) => r.projectId === p.id);
          const active = runs.filter((r) => r.status === 'running').length;
          const spend = state.usage
            .filter((u) => runs.some((r) => r.id === u.runId))
            .reduce((s, u) => s + (u.amount ?? 0), 0);
          return (
            <section className="project-card" key={p.id}>
              <div className="project-card-top">
                <span
                  className="project-monogram"
                  style={{ background: p.color + '20', color: p.color }}
                >
                  {p.name.slice(0, 2)}
                </span>
                <Badge value={active ? 'running' : 'idle'} />
              </div>
              <h2>
                {p.name}
                <span className="sample-pill">{p.simulated ? 'Sample' : 'Local'}</span>
              </h2>
              <p>{p.description}</p>
              <code>{p.path}</code>
              <div className="project-branch">
                <GitBranch size={13} />
                {p.branch}
              </div>
              <div className="project-stats">
                <div>
                  <strong>{runs.length}</strong>
                  <span>Total runs</span>
                </div>
                <div>
                  <strong>{active}</strong>
                  <span>Running</span>
                </div>
                <div>
                  <strong>
                    {state.usage.some((u) => runs.some((r) => r.id === u.runId))
                      ? money(spend)
                      : 'Unknown'}
                  </strong>
                  <span>Known estimates</span>
                </div>
              </div>
              <div className="project-card-footer">
                <span>
                  Added <Time value={p.createdAt} />
                </span>
                <Link to="/runs" onClick={() => selectProject(p.id)}>
                  Explore runs <ArrowUpRight size={14} />
                </Link>
              </div>
            </section>
          );
        })}
        <button className="project-card add-project" onClick={() => setOpen(true)}>
          <FolderGit2 size={30} />
          <h3>Bring your next project</h3>
          <p>Register a repository without changing its source, hooks or provider settings.</p>
          <span>
            <Plus size={14} />
            Add project
          </span>
        </button>
      </div>
      {!projects.length && <Empty title="No matching projects" />}
      <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add a local project</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Registers repository metadata only. No files, Git hooks or credentials are changed. Use
            the CLI to attach an executable task.
          </Alert>
          <div className="form-stack">
            <TextField
              label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 80 }}
            />
            <TextField
              label="Absolute repository path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/projects/my-project"
              fullWidth
              helperText="An absolute local path is required. The dashboard does not read your repository."
            />
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !name.trim() || !path.startsWith('/')}
            onClick={add}
          >
            {busy ? 'Adding…' : 'Add project'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
