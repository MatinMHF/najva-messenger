import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/uiStore';
import { initialsOf, avatarGradient } from '../utils/avatar';
import api from '../lib/api';
import './AdminPage.css';

interface ServerStats {
  cpu: { loadAverage: number; cores: number };
  memory: { total: number; used: number; free: number; percentage: number };
  disk: { total: number; free: number; used: number; percentage: number };
  uptime: number;
}
interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isBlocked: boolean;
  isSuspended: boolean;
  storageUsed: number;
  storageLimit: number;
}
interface AdminTicket {
  id: string;
  subject?: string;
  status?: string;
  username?: string;
  user?: { username?: string };
  createdAt?: string;
}
interface AuthorizeResult { token: string; expiresInHours?: number; }

const fmtBytes = (n: number): string => {
  if (!n || n < 0) return '0';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

const Ic = { // shared inline icon paths
  shield: ['M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z', 'M9 12l2 2 4-4'],
};

export const AdminPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { language, setLanguage } = useUIStore();
  const lang = language === 'fa' ? 'fa' : 'en';

  const [stats, setStats] = useState<ServerStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [ticketOpenCount, setTicketOpenCount] = useState(0);
  const [ticketTab, setTicketTab] = useState<'open' | 'closed'>('open');
  const [userQ, setUserQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2400);
  };

  // ban (block) confirm + suspend duration picker
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);

  // authorize-reset modal
  const [authTarget, setAuthTarget] = useState<AdminUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authResult, setAuthResult] = useState<AuthorizeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await api.get('/admin/users', { params: { limit: 50 } });
    setUsers(res.data.users || []);
    setTotal(res.data.total ?? (res.data.users?.length || 0));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes] = await Promise.all([api.get('/admin/stats'), loadUsers()]);
      setStats(statsRes.data);
      try {
        const tk = await api.get('/admin/support-tickets');
        const list: AdminTicket[] = Array.isArray(tk.data) ? tk.data : (tk.data?.tickets || []);
        setTickets(list);
        const hasStatus = list.some((x) => typeof x.status === 'string');
        const open = list.filter((x) => x.status !== 'CLOSED' && x.status !== 'RESOLVED');
        setTicketOpenCount(hasStatus ? open.length : list.length);
      } catch { /* tickets optional */ }
      setForbidden(false);
      setError('');
    } catch (e: any) {
      if (e?.response?.status === 403) setForbidden(true);
      else setError(t('admin.loadError', 'Could not load admin data.'));
    } finally {
      setLoading(false);
    }
  }, [loadUsers, t]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const doBan = async (u: AdminUser) => {
    setBanTarget(null);
    setRowBusy(u.id);
    try {
      await api.put(`/admin/users/${u.id}/${u.isBlocked ? 'unblock' : 'block'}`);
      await loadUsers();
      showToast(u.isBlocked ? t('admin.liftedToast', 'Restrictions lifted') : t('admin.bannedToast', 'User has been banned'));
    } catch { setError(t('admin.actionFailed', 'Action failed.')); }
    finally { setRowBusy(null); }
  };

  const doSuspend = async (u: AdminUser, durationLabel?: string) => {
    setSuspendTarget(null);
    setRowBusy(u.id);
    try {
      if (u.isSuspended) await api.put(`/admin/users/${u.id}/unsuspend`);
      else await api.put(`/admin/users/${u.id}/suspend`, { reason: durationLabel ? `Suspended by admin (${durationLabel})` : 'Suspended by admin' });
      await loadUsers();
      showToast(u.isSuspended ? t('admin.liftedToast', 'Restrictions lifted') : t('admin.suspendedToast', 'User suspended'));
    } catch { setError(t('admin.actionFailed', 'Action failed.')); }
    finally { setRowBusy(null); }
  };

  const confirmAuthorize = async () => {
    if (!authTarget) return;
    setAuthBusy(true);
    try {
      const res = await api.post(`/admin/users/${authTarget.id}/authorize-reset`);
      setAuthResult(res.data);
    } catch { setError(t('admin.actionFailed', 'Action failed.')); setAuthTarget(null); }
    finally { setAuthBusy(false); }
  };
  const closeAuthorize = () => { setAuthTarget(null); setAuthResult(null); setCopied(false); };
  const copyToken = () => {
    if (authResult?.token) { navigator.clipboard?.writeText(authResult.token); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };

  const setLang = (l: 'en' | 'fa') => { setLanguage(l); i18n.changeLanguage(l); };

  const memPct = stats ? Math.round(stats.memory.percentage) : 0;
  const diskPct = stats ? Math.round(stats.disk.percentage) : 0;

  const uq = userQ.trim().toLowerCase();
  const shownUsers = users.filter((u) => !uq || (u.displayName || u.username).toLowerCase().includes(uq) || u.username.toLowerCase().includes(uq));

  const shownTickets = tickets.filter((tk) => {
    const isOpen = tk.status !== 'CLOSED' && tk.status !== 'RESOLVED';
    return ticketTab === 'open' ? isOpen : !isOpen;
  });

  const suspendDurations = [
    t('admin.s1h', '1 Hour'), t('admin.s1d', '1 Day'), t('admin.s3d', '3 Days'), t('admin.s1w', '1 Week'), t('admin.s1m', '1 Month'),
  ];

  return (
    <div className="nj-admin">
      {/* header */}
      <div className="nj-admin-head">
        <div className="nj-admin-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{Ic.shield.map((d, i) => <path key={i} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}</svg>
        </div>
        <div className="nj-admin-id">
          <span className="nj-admin-title">{t('admin.title', 'Najva Admin')}</span>
          <span className="nj-admin-sub">{t('admin.subtitle', 'Internal control panel — restricted access')}</span>
        </div>
        <div className="nj-admin-lang">
          <button className={`nj-admin-lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
          <button className={`nj-admin-lang-btn ${lang === 'fa' ? 'active' : ''}`} onClick={() => setLang('fa')}>فا</button>
        </div>
      </div>

      {forbidden && <div className="nj-admin-notice">{t('admin.forbidden', 'You do not have administrator access.')}</div>}
      {error && <div className="nj-admin-notice error">{error}</div>}

      {!forbidden && (
        <>
          {/* stat cards */}
          <div className="nj-admin-stats">
            <div className="nj-stat">
              <div className="nj-stat-top">
                <span className="nj-stat-ic teal"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" /><path d="M2 19.5C2 16.5 4.7 14 8 14s6 2.5 6 5.5M16 4.5c3 .5 3 6.5 0 7M17.5 14.5c2.7.6 4.5 2.6 4.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                <span className="nj-stat-label">{t('admin.totalUsers', 'Total users')}</span>
              </div>
              <span className="nj-stat-val">{loading ? '—' : total.toLocaleString()}</span>
              <span className="nj-stat-note">{t('admin.registered', 'registered accounts')}</span>
            </div>

            <div className="nj-stat">
              <div className="nj-stat-top">
                <span className="nj-stat-ic amber"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 13a8 8 0 1 1 16 0M4 13v3a2 2 0 0 0 2 2h1v-5H4ZM20 13v3a2 2 0 0 1-2 2h-1v-5h3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
                <span className="nj-stat-label">{t('admin.openTickets', 'Open tickets')}</span>
              </div>
              <span className="nj-stat-val">{loading ? '—' : ticketOpenCount}</span>
              <span className="nj-stat-note">{t('admin.support', 'support queue')}</span>
            </div>

            <div className="nj-stat">
              <div className="nj-stat-top">
                <span className="nj-stat-ic teal"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z" stroke="currentColor" strokeWidth="2" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" stroke="currentColor" strokeWidth="2" /></svg></span>
                <span className="nj-stat-label">{t('admin.storage', 'Storage usage')}</span>
              </div>
              <span className="nj-stat-val">{stats ? <>{fmtBytes(stats.disk.used)} <small>/ {fmtBytes(stats.disk.total)}</small></> : '—'}</span>
              <div className="nj-stat-bar"><span className="teal" style={{ width: `${diskPct}%` }} /></div>
            </div>

            <div className="nj-stat">
              <div className="nj-stat-top">
                <span className="nj-stat-ic amber"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="2" /><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                <span className="nj-stat-label">{t('admin.ram', 'RAM usage')}</span>
              </div>
              <span className="nj-stat-val">{stats ? <>{fmtBytes(stats.memory.used)} <small>/ {fmtBytes(stats.memory.total)}</small></> : '—'}</span>
              <div className="nj-stat-bar"><span className="amber" style={{ width: `${memPct}%` }} /></div>
            </div>
          </div>

          {/* main grid */}
          <div className="nj-admin-main">
            {/* users */}
            <div className="nj-admin-panel">
              <div className="nj-admin-panel-head">
                <span className="nj-admin-panel-title">{t('admin.users', 'Users')}</span>
                <input className="nj-admin-search" placeholder={t('admin.search', 'Search users')} value={userQ} onChange={(e) => setUserQ(e.target.value)} />
              </div>
              {loading && <div className="nj-admin-empty">{t('common.loading', 'Loading…')}</div>}
              {!loading && shownUsers.length === 0 && <div className="nj-admin-empty">{t('admin.noUsers', 'No users.')}</div>}
              {shownUsers.map((u, i) => {
                const name = u.displayName || u.username;
                const chipCls = u.isBlocked ? 'banned' : u.isSuspended ? 'suspended' : 'active';
                const chipLabel = u.isBlocked ? t('admin.banned', 'Banned') : u.isSuspended ? t('admin.suspended', 'Suspended') : t('admin.active', 'Active');
                const busy = rowBusy === u.id;
                return (
                  <div className="nj-urow" key={u.id} style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                    <div className="nj-urow-avatar" style={{ background: avatarGradient(name), opacity: u.isBlocked ? 0.4 : 1 }}>{initialsOf(name)}</div>
                    <div className="nj-urow-info">
                      <span className="nj-urow-name">{name}</span>
                      <span className="nj-urow-handle" dir="ltr">@{u.username}</span>
                    </div>
                    <span className={`nj-chip ${chipCls}`}>{chipLabel}</span>
                    {!u.isBlocked && !u.isSuspended && (
                      <>
                        <button className="nj-urow-btn suspend" disabled={busy} onClick={() => setSuspendTarget(u)}>{t('admin.suspend', 'Suspend')}</button>
                        <button className="nj-urow-btn ban" disabled={busy} onClick={() => setBanTarget(u)}>{t('admin.ban', 'Ban')}</button>
                      </>
                    )}
                    {u.isBlocked && (
                      <button className="nj-urow-btn lift" disabled={busy} onClick={() => doBan(u)}>{t('admin.unban', 'Unban')}</button>
                    )}
                    {u.isSuspended && !u.isBlocked && (
                      <button className="nj-urow-btn lift" disabled={busy} onClick={() => doSuspend(u)}>{t('admin.lift', 'Lift suspension')}</button>
                    )}
                    <button className="nj-urow-btn key" disabled={busy} onClick={() => { setAuthResult(null); setAuthTarget(u); }} title={t('admin.authorizeReset', 'Authorize reset')}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="2" /><path d="M10.8 12.2 20 3M17 6l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* tickets */}
            <div className="nj-admin-panel">
              <div className="nj-admin-panel-head">
                <span className="nj-admin-panel-title">{t('admin.tickets', 'Tickets')}</span>
                <div className="nj-tabs">
                  <button className={`nj-tab ${ticketTab === 'open' ? 'active' : ''}`} onClick={() => setTicketTab('open')}>{t('admin.openTab', 'Open')}</button>
                  <button className={`nj-tab ${ticketTab === 'closed' ? 'active' : ''}`} onClick={() => setTicketTab('closed')}>{t('admin.closedTab', 'Closed')}</button>
                </div>
              </div>
              {shownTickets.length === 0 && <div className="nj-admin-empty">{t('admin.noTickets', 'No tickets here.')}</div>}
              {shownTickets.map((tk, i) => {
                const open = ticketTab === 'open';
                const handle = tk.username || tk.user?.username;
                const when = tk.createdAt ? new Date(tk.createdAt).toLocaleDateString() : '';
                return (
                  <div className="nj-trow" key={tk.id} style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
                    <span className={`nj-trow-ic ${open ? 'open' : 'closed'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 13a8 8 0 1 1 16 0M4 13v3a2 2 0 0 0 2 2h1v-5H4ZM20 13v3a2 2 0 0 1-2 2h-1v-5h3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                    </span>
                    <span className="nj-trow-info">
                      <span className="nj-trow-subj">{tk.subject || tk.id}</span>
                      <span className="nj-trow-meta">{[tk.id, handle ? `@${handle}` : '', when].filter(Boolean).join(' • ')}</span>
                    </span>
                    <span className={`nj-trow-chip ${open ? 'open' : 'closed'}`}>{open ? t('admin.open', 'Open') : t('admin.closed', 'Closed')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ban confirm */}
      {banTarget && (
        <div className="nj-admin-overlay" onClick={() => setBanTarget(null)}>
          <div className="nj-admin-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="nj-dlg-top">
              <span className="nj-dlg-ic red"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M5.5 5.5l13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
              <span className="nj-dlg-q">{t('admin.banQ', 'Ban {{name}}? They will completely lose access to Najva.', { name: banTarget.displayName || banTarget.username })}</span>
            </div>
            <div className="nj-dlg-btns">
              <button className="nj-dlg-btn cancel" onClick={() => setBanTarget(null)}>{t('common.cancel', 'Cancel')}</button>
              <button className="nj-dlg-btn danger" onClick={() => doBan(banTarget)}>{t('admin.ban', 'Ban')}</button>
            </div>
          </div>
        </div>
      )}

      {/* suspend duration picker */}
      {suspendTarget && (
        <div className="nj-admin-overlay" onClick={() => setSuspendTarget(null)}>
          <div className="nj-admin-dialog picker" onClick={(e) => e.stopPropagation()}>
            <span className="nj-dlg-title">{t('admin.suspendQ', 'Suspend {{name}}', { name: suspendTarget.displayName || suspendTarget.username })}</span>
            <span className="nj-dlg-sub">{t('admin.suspendHow', 'How long should this user be suspended?')}</span>
            {suspendDurations.map((d) => (
              <button key={d} className="nj-dlg-opt" onClick={() => doSuspend(suspendTarget, d)}>
                <span className="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                {d}
              </button>
            ))}
            <button className="nj-dlg-close" onClick={() => setSuspendTarget(null)}>{t('common.cancel', 'Cancel')}</button>
          </div>
        </div>
      )}

      {/* authorize-reset modal */}
      {authTarget && (
        <div className="nj-admin-overlay" onClick={closeAuthorize}>
          <div className="nj-admin-dialog" onClick={(e) => e.stopPropagation()}>
            {!authResult ? (
              <>
                <div className="nj-dlg-top">
                  <span className="nj-dlg-ic red"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 9v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
                  <span className="nj-dlg-q">{t('admin.authorizeReset', 'Authorize reset')}</span>
                </div>
                <p className="nj-dlg-body">
                  {t('admin.authorizeWarn', 'This issues a one-time token so {{name}} can rebuild their encryption identity from scratch. This is irreversible: all of their existing message history becomes permanently unreadable, and their conversations will be re-keyed.', { name: authTarget.displayName || authTarget.username })}
                </p>
                <div className="nj-dlg-btns">
                  <button className="nj-dlg-btn cancel" onClick={closeAuthorize} disabled={authBusy}>{t('common.cancel', 'Cancel')}</button>
                  <button className="nj-dlg-btn danger" onClick={confirmAuthorize} disabled={authBusy}>{authBusy ? t('common.loading', 'Loading…') : t('admin.issueToken', 'Issue token')}</button>
                </div>
              </>
            ) : (
              <>
                <div className="nj-dlg-top">
                  <span className="nj-dlg-ic teal"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="2" /><path d="M10.8 12.2 20 3M17 6l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  <span className="nj-dlg-q">{t('admin.tokenIssued', 'Authorization token issued')}</span>
                </div>
                <p className="nj-dlg-body">{t('admin.tokenHint', 'Give this one-time token to the user through a verified channel. It expires shortly and can be used once.')}</p>
                <div className="nj-admin-token">
                  <code>{authResult.token}</code>
                  <button onClick={copyToken}>{copied ? t('common.copied', 'Copied') : t('common.copy', 'Copy')}</button>
                </div>
                {authResult.expiresInHours && <p className="nj-admin-token-exp">{t('admin.validFor', 'Valid for {{count}} hours, single use.', { count: authResult.expiresInHours })}</p>}
                <div className="nj-dlg-btns">
                  <button className="nj-dlg-btn primary" onClick={() => { closeAuthorize(); loadUsers(); }}>{t('common.done', 'Done')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="nj-admin-toast">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 L10 18.5 L20 6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
};
