import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  CssBaseline,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  ThemeProvider,
} from '@mui/material';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePause,
  Cpu,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Context, useControlPlane } from './api';
import { makeTheme } from './theme';
import { VERSION } from '../shared/version';
import { NewRunDialog } from './components/NewRunDialog';
import { Tasks } from './pages/Tasks';
import { Overview } from './pages/Overview';
import { Fleet } from './pages/Fleet';
import { Projects } from './pages/Projects';
import { Runs } from './pages/Runs';
import { Incidents } from './pages/Incidents';
import { Approvals } from './pages/Approvals';
import { Costs } from './pages/Costs';
import { Integrations } from './pages/Integrations';
import { Settings } from './pages/Settings';
import { Time } from './components/common';
const navigation: { title: string; items: [string, string, typeof LayoutDashboard][] }[] = [
  {
    title: 'WORKSPACE',
    items: [['/', 'Managed tasks', ShieldCheck]],
  },
  {
    title: 'SAMPLE CONSOLE',
    items: [
      ['/overview', 'Sample overview', LayoutDashboard],
      ['/projects', 'Projects', FolderGit2],
      ['/fleet', 'Agent fleet', Cpu],
      ['/runs', 'Runs', Activity],
    ],
  },
  {
    title: 'SAMPLE SUPERVISION',
    items: [
      ['/incidents', 'Incidents', ShieldCheck],
      ['/approvals', 'Approvals', CirclePause],
      ['/costs', 'Costs & usage', Wallet],
    ],
  },
  {
    title: 'COMPANIONS',
    items: [
      ['/memory', 'Memory', Blocks],
      ['/observability', 'Observability', Network],
      ['/atbot', 'AtBot', Bot],
    ],
  },
];
export default function App() {
  const cp = useControlPlane();
  const [projectId, setProject] = useState('project-atmem');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(1);
  const [newRun, setNewRun] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('atsys-dark') === 'true');
  const [help, setHelp] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const operational = location.pathname === '/' || location.pathname.startsWith('/tasks');
  const theme = useMemo(() => makeTheme(dark), [dark]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('atsys-dark', String(dark));
  }, [dark]);
  useEffect(() => {
    setMobile(false);
    setSearch('');
  }, [location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setMobile(false);
        setNotifications(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const notify = (text: string, error = false) => setToast({ text, error });
  async function perform<T>(fn: () => Promise<T>, message = 'Saved') {
    try {
      const result = await fn();
      await cp.refresh();
      notify(message);
      return result;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed', true);
      return undefined;
    }
  }
  const state = cp.state;
  const project = state?.projects.find((p) => p.id === projectId);
  const pending =
    state?.proposals.filter(
      (p) =>
        p.status === 'pending' &&
        (projectId === 'all' || state.runs.find((r) => r.id === p.runId)?.projectId === projectId),
    ).length ?? 0;
  const incidents =
    state?.incidents.filter(
      (i) =>
        i.status !== 'resolved' &&
        (projectId === 'all' || state.runs.find((r) => r.id === i.runId)?.projectId === projectId),
    ).length ?? 0;
  const title =
    navigation.flatMap((g) => g.items).find(([path]) => path === location.pathname)?.[1] ??
    (location.pathname.startsWith('/tasks')
      ? 'Managed tasks'
      : location.pathname.startsWith('/runs/')
        ? 'Run details'
        : 'Settings');
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {mobile && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'open' : ''}`}>
          <Link to="/" className="brand">
            <div className="brand-symbol">
              <span />Λ
            </div>
            <div>
              AtSys<span>AGENT CONTROL PLANE</span>
            </div>
            <span className="version">v{VERSION}</span>
          </Link>
          <div className="workspace-label">
            <div className="workspace-avatar">J</div>
            <div>
              <strong>Local workspace</strong>
              <span>Personal · single operator</span>
            </div>
            <ChevronDown size={13} />
          </div>
          <nav aria-label="Main navigation">
            {navigation.map((group) => (
              <div className="nav-group" key={group.title}>
                <div className="nav-group-title">
                  {group.title}
                  {group.title === 'COMPANIONS' && <span>OPTIONAL</span>}
                </div>
                {group.items.map(([path, label, Icon]) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={path === '/'}
                    className={({ isActive }) =>
                      isActive || (path === '/' && operational) ? 'active' : undefined
                    }
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    {!operational &&
                      state?.settings.notifications &&
                      path === '/incidents' &&
                      incidents > 0 && <b className="nav-count warning">{incidents}</b>}
                    {!operational &&
                      state?.settings.notifications &&
                      path === '/approvals' &&
                      pending > 0 && <b className="nav-count">{pending}</b>}
                    {['/memory', '/observability', '/atbot'].includes(path) && (
                      <i className="nav-off" />
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note">
              <div>
                <span className="tiny-dot" />
                LOCAL-FIRST BY DESIGN
              </div>
              <p>
                Your projects. Your agents.
                <br />
                You stay in control.
              </p>
              <a
                href="https://github.com/kubernetes-sigs/headlamp"
                target="_blank"
                rel="noreferrer"
              >
                Built with Headlamp patterns <ArrowUpRight size={12} />
              </a>
            </div>
            <NavLink className="settings-link" to="/settings">
              <SettingsIcon size={17} />
              Settings
              <ChevronRight size={14} />
            </NavLink>
            <button className="operator" onClick={() => setHelp(true)}>
              <span className="operator-avatar">JT</span>
              <span>
                <strong>Local operator</strong>
                <small>All systems, one workspace</small>
              </span>
              <CircleHelp size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <IconButton
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </IconButton>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{title}</strong>
            </div>
            <div className="global-search">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Search workspace"
                placeholder="Search this view…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="header-actions">
              <span className={`connection ${cp.error ? 'offline' : ''}`}>
                <i />
                {cp.error ? 'Disconnected' : 'Local connection'}
              </span>
              <IconButton
                aria-label={dark ? 'Use light theme' : 'Use dark theme'}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </IconButton>
              <div
                className="notification-anchor"
                style={operational ? { display: 'none' } : undefined}
              >
                <IconButton
                  aria-label="Open notifications"
                  onClick={() => setNotifications(!notifications)}
                >
                  <Bell size={18} />
                  {state?.settings.notifications && pending > 0 && (
                    <span className="notification-dot" />
                  )}
                </IconButton>
                {notifications && (
                  <div className="notification-popover">
                    <h3>
                      Notification center <span>{incidents}</span>
                    </h3>
                    <p>In-app incidents are always recorded.</p>
                    {state?.incidents
                      .filter((i) => i.status !== 'resolved')
                      .slice(0, 5)
                      .map((i) => (
                        <button
                          key={i.id}
                          onClick={() => {
                            navigate('/incidents');
                            setNotifications(false);
                          }}
                        >
                          <ShieldCheck size={17} />
                          <span>
                            <strong>{i.title}</strong>
                            <small>
                              {i.id} · <Time value={i.createdAt} />
                            </small>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    {!incidents && (
                      <p>
                        <Check size={15} /> Nothing needs your attention.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="header-avatar">JT</div>
            </div>
          </header>
          <main id="main-content">
            <div
              className="scope-bar"
              style={
                location.pathname === '/' || location.pathname.startsWith('/tasks')
                  ? { display: 'none' }
                  : undefined
              }
            >
              <div className="inline">
                <FolderGit2 size={15} />
                <select
                  aria-label="Select project"
                  value={projectId}
                  onChange={(e) => {
                    setProject(e.target.value);
                    if (location.pathname.startsWith('/runs/')) navigate('/runs');
                  }}
                >
                  <option value="all">All projects</option>
                  {state?.projects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} />
                <span className="scope-divider" />
                <span className="branch">
                  <GitBranch size={13} />
                  {project?.branch ?? 'All branches'}
                </span>
                <span className="demo-chip">
                  <Sparkles size={11} />
                  {location.pathname === '/' || location.pathname.startsWith('/tasks')
                    ? 'Live task service'
                    : project?.simulated
                      ? 'Sample project'
                      : 'Local project'}
                </span>
              </div>
              <div className="inline scope-right">
                <span className="last-sync">
                  Updated {cp.updated ? <Time value={cp.updated} /> : '—'}
                </span>
                <select
                  aria-label="Time range"
                  value={range}
                  onChange={(e) => setRange(Number(e.target.value))}
                >
                  <option value={1}>Last 24 hours</option>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
                <ChevronDown size={12} />
              </div>
            </div>
            {cp.error && (
              <Alert
                severity="warning"
                action={
                  <Button size="small" onClick={() => void cp.refresh()}>
                    Retry
                  </Button>
                }
                sx={{ mb: 2 }}
              >
                Control plane unavailable. Displayed records may be stale. {cp.error}
              </Alert>
            )}
            {!state ? (
              <div className="loading-state">
                <CircularProgress size={28} />
                <h2>Connecting to your control plane</h2>
                <p>Start the local API with npm run dev.</p>
              </div>
            ) : (
              <Context.Provider
                value={{
                  state,
                  projectId,
                  selectProject: setProject,
                  online: !cp.error,
                  search,
                  range,
                  refresh: cp.refresh,
                  notify,
                  perform,
                }}
              >
                <Routes>
                  <Route path="/" element={<Tasks />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/tasks/:taskId" element={<Tasks />} />
                  <Route path="/overview" element={<Overview onNewRun={() => setNewRun(true)} />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/fleet" element={<Fleet />} />
                  <Route path="/runs" element={<Runs onNewRun={() => setNewRun(true)} />} />
                  <Route path="/runs/:runId" element={<Runs onNewRun={() => setNewRun(true)} />} />
                  <Route path="/incidents" element={<Incidents />} />
                  <Route path="/approvals" element={<Approvals />} />
                  <Route path="/costs" element={<Costs />} />
                  <Route path="/memory" element={<Integrations kind="memory" />} />
                  <Route path="/observability" element={<Integrations kind="observability" />} />
                  <Route path="/atbot" element={<Integrations kind="atbot" />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route
                    path="*"
                    element={
                      <div className="empty">
                        <h1>View not found</h1>
                        <Link to="/">Return to overview</Link>
                      </div>
                    }
                  />
                </Routes>
                <NewRunDialog open={newRun} onClose={() => setNewRun(false)} />
              </Context.Provider>
            )}
            <footer className="app-footer">
              <span>
                <span className="tiny-dot" />
                AtSys control plane <span className="muted">/</span> local
              </span>
              <span>
                Managed tasks use real processes. Sample console records are labeled separately.
              </span>
              <button onClick={() => setHelp(true)}>
                Help & shortcuts <CircleHelp size={12} />
              </button>
            </footer>
          </main>
        </div>
        <Snackbar
          open={!!toast}
          autoHideDuration={5000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert severity={toast?.error ? 'error' : 'success'} onClose={() => setToast(null)}>
            {toast?.text}
          </Alert>
        </Snackbar>
        <Dialog open={help} onClose={() => setHelp(false)} fullWidth maxWidth="sm">
          <DialogTitle>
            Welcome to your control room
            <IconButton
              sx={{ float: 'right' }}
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <p>
              AtSys supervises long-running agent tasks with durable state, evidence and bounded
              recovery.
            </p>
            <div className="subtle-box">
              <h3>Delegate and supervise coding work</h3>
              <p>
                Create a managed task with an objective, worker, acceptance checks and recovery
                policy. Execution and supervision continue independently of this dashboard.
              </p>
              <p>
                <kbd>⌘ / Ctrl K</kbd> Search this view · <kbd>Esc</kbd> Close navigation
              </p>
            </div>
            <p>
              Codex exec and local commands are supported. Configure models, deadlines, recovery and
              Telegram from Managed tasks. Sample console screens are separately labeled.
            </p>
            <Button
              startIcon={<Plus size={16} />}
              onClick={() => {
                setHelp(false);
                navigate('/');
              }}
              variant="contained"
            >
              Open managed tasks
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </ThemeProvider>
  );
}
