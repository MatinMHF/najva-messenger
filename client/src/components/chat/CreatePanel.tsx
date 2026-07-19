import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import api from '../../lib/api';
import { initialsOf, avatarGradient } from '../../utils/avatar';
import { createDirectConversation, createGroupOrChannel } from '../../lib/conversations';

/**
 * Compose slide-out — faithful port of the Cloud Design's "create new" panel
 * (FAB → full-cover slide-out over the left pane). Three steps:
 *   menu  → New Chat / New Group / New Channel
 *   form  → name + @username  (group/channel only)
 *   pick  → search + select (single for chat, multi for group/channel)
 * Wired to the real backend: /users/search + createDirectConversation /
 * createGroupOrChannel. ponytail: the group/channel @username matches the
 * design but the backend has no handle field — it's sent and ignored, not
 * persisted, until the model gains one.
 */

const STR = {
  en: {
    createNew: 'Create New', back: 'Back', search: 'Search',
    newChatOpt: 'Create New Chat', newGroupOpt: 'Create New Group', newChannelOpt: 'Create Channel',
    newChatSub: 'Start a private conversation', newGroupSub: 'Bring people together', newChannelSub: 'Broadcast to a large audience',
    groupNameQ: 'What is the group name?', channelNameQ: 'What is the channel name?',
    groupUserQ: 'What is the group username?', channelUserQ: 'What is the channel username?',
    groupNamePh: 'Group name', channelNamePh: 'Channel name', usernamePh: 'username',
    selectContact: 'Select Contact', addMembers: 'Add Members',
    next: 'NEXT', done: 'DONE', online: 'Online', lastSeen: 'last seen recently',
    noResults: 'No users found', searchHint: 'Search people to add',
  },
  fa: {
    createNew: 'ایجاد جدید', back: 'بازگشت', search: 'جستجو',
    newChatOpt: 'ایجاد چت جدید', newGroupOpt: 'ایجاد گروه جدید', newChannelOpt: 'ایجاد کانال',
    newChatSub: 'شروع گفتگوی خصوصی', newGroupSub: 'دور هم جمع شوید', newChannelSub: 'انتشار برای مخاطبان گسترده',
    groupNameQ: 'نام گروه چیست؟', channelNameQ: 'نام کانال چیست؟',
    groupUserQ: 'نام کاربری گروه چیست؟', channelUserQ: 'نام کاربری کانال چیست؟',
    groupNamePh: 'نام گروه', channelNamePh: 'نام کانال', usernamePh: 'نام کاربری',
    selectContact: 'انتخاب مخاطب', addMembers: 'افزودن اعضا',
    next: 'بعدی', done: 'انجام شد', online: 'آنلاین', lastSeen: 'به‌تازگی دیده شده',
    noResults: 'کاربری یافت نشد', searchHint: 'جستجوی افراد برای افزودن',
  },
};

type Step = 'menu' | 'form' | 'pick';
type Kind = 'chat' | 'group' | 'channel';
interface Picked { id: string; name: string; }

const CreatePanel: React.FC = () => {
  const { activeModal, setActiveModal, language } = useUIStore();
  const { user: currentUser } = useAuthStore();
  const { setChats, setActiveChat } = useChatStore();
  const t = STR[language === 'fa' ? 'fa' : 'en'];

  const [step, setStep] = useState<Step>('menu');
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [sel, setSel] = useState<Record<string, Picked>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const open = activeModal === 'new-group';
  const single = kind === 'chat';

  // reset each time the panel opens
  useEffect(() => {
    if (open) { setStep('menu'); setKind(null); setName(''); setUsername(''); setSel({}); setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (step !== 'pick' || query.trim().length === 0) { setResults([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${query}`);
        setResults(res.data.filter((u: any) => u.id !== currentUser?.id));
      } catch (e) { console.error(e); } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(h);
  }, [query, step, currentUser?.id]);

  if (!open) return null;

  const close = () => setActiveModal(null);
  const back = () => {
    if (step === 'menu') close();
    else if (step === 'pick' && !single) { setStep('form'); setSel({}); setQuery(''); }
    else { setStep('menu'); setSel({}); setQuery(''); }
  };

  const toMenuRow = (label: string, sub: string, iconBg: string, icon: React.ReactNode, onClick: () => void) => (
    <button className="nj-create-row" onClick={onClick}>
      <span className="nj-create-row-ic" style={{ background: iconBg }}>{icon}</span>
      <span className="nj-create-row-txt">
        <span className="nj-create-row-label">{label}</span>
        <span className="nj-create-row-sub">{sub}</span>
      </span>
    </button>
  );

  const pickRow = (u: any) => {
    const uName = u.displayName || u.username;
    const selected = !!sel[u.id];
    return (
      <button key={u.id} className={`nj-create-pick${selected ? ' sel' : ''}`} onClick={() => {
        setSel((prev) => {
          if (single) return { [u.id]: { id: u.id, name: uName } };
          const next = { ...prev };
          if (next[u.id]) delete next[u.id]; else next[u.id] = { id: u.id, name: uName };
          return next;
        });
      }}>
        <div className="nj-create-pick-av" style={{ background: avatarGradient(uName) }}>{initialsOf(uName)}</div>
        <span className="nj-create-pick-txt">
          <span className="nj-create-pick-name">{uName}</span>
          <span className="nj-create-pick-sub" style={{ color: u.status === 'ONLINE' ? 'var(--nj-teal)' : 'var(--nj-muted)' }}>{u.status === 'ONLINE' ? t.online : t.lastSeen}</span>
        </span>
        <span className={`nj-create-mark${single ? ' round' : ''}${selected ? ' on' : ''}`}>
          {selected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 L10 18.5 L20 6.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
      </button>
    );
  };

  const selIds = Object.keys(sel);
  const enabled = step === 'form' ? (name.trim().length > 0 && username.trim().length > 0) : selIds.length > 0;
  const title = step === 'menu' ? t.createNew : step === 'form' ? (kind === 'group' ? t.newGroupOpt : t.newChannelOpt) : (single ? t.selectContact : t.addMembers);

  const createChat = async (p: Picked) => {
    if (!currentUser?.id) return;
    const conv = await createDirectConversation(currentUser.id, p.id);
    setChats([{ id: conv.id, type: 'direct', participants: [p.name], unreadCount: 0, currentKeyVersion: conv.currentKeyVersion ?? 1, role: 'ADMIN' }]);
    setActiveChat(conv.id);
  };
  const createGroup = async () => {
    if (!currentUser?.id) return;
    const type = kind === 'channel' ? 'CHANNEL' : 'GROUP';
    const conv = await createGroupOrChannel(currentUser.id, name.trim(), selIds, type);
    setChats([{
      id: conv.id,
      type: type === 'CHANNEL' ? 'channel' : 'group',
      name: name.trim() || conv.name,
      participants: Object.values(sel).map((p) => p.name),
      unreadCount: 0,
      currentKeyVersion: conv.currentKeyVersion ?? 1,
      role: 'ADMIN',
    }]);
    setActiveChat(conv.id);
  };

  const onNext = async () => {
    if (!enabled) return;
    if (step === 'form') { setStep('pick'); setSel({}); setQuery(''); return; }
    try {
      if (single) await createChat(Object.values(sel)[0]);
      else await createGroup();
      close();
    } catch (e) { console.error('create failed:', e); }
  };

  return (
    <div className="nj-create-panel">
      <div className="nj-create-head">
        <button className="nj-panel-back" onClick={back} title={t.back} aria-label={t.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="nj-create-title">{title}</span>
      </div>

      <div className="nj-create-body">
        {step === 'menu' && (
          <>
            {toMenuRow(t.newChatOpt, t.newChatSub, 'linear-gradient(135deg, #1e8a96, #14707c)',
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>,
              () => { setKind('chat'); setSel({}); setQuery(''); setStep('pick'); })}
            {toMenuRow(t.newGroupOpt, t.newGroupSub, 'linear-gradient(135deg, #f5a623, #e08c0b)',
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1.5 19c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5M16 11a3 3 0 1 0-.01-6M17 14c2.8 .3 5 2.4 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
              () => { setKind('group'); setName(''); setUsername(''); setStep('form'); })}
            {toMenuRow(t.newChannelOpt, t.newChannelSub, 'linear-gradient(135deg, #5b8f6b, #3f7350)',
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8a3 3 0 0 1 0 6M4 9v6h3l6 4V5L7 9H4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>,
              () => { setKind('channel'); setName(''); setUsername(''); setStep('form'); })}
          </>
        )}

        {step === 'form' && (
          <>
            <label className="nj-create-field">
              <span className="nj-create-lbl">{kind === 'channel' ? t.channelNameQ : t.groupNameQ}</span>
              <input className="nj-create-input" type="text" placeholder={kind === 'channel' ? t.channelNamePh : t.groupNamePh} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="nj-create-field">
              <span className="nj-create-lbl">{kind === 'channel' ? t.channelUserQ : t.groupUserQ}</span>
              <span className="nj-create-userwrap">
                <span className="nj-create-at">@</span>
                <input className="nj-create-userinput" type="text" placeholder={t.usernamePh} value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} />
              </span>
            </label>
          </>
        )}

        {step === 'pick' && (
          <>
            <input className="nj-create-searchpill" type="text" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            {searching ? (
              <div className="nj-empty-list">…</div>
            ) : results.length > 0 ? (
              results.map(pickRow)
            ) : (
              <div className="nj-empty-list">{query.trim() ? t.noResults : t.searchHint}</div>
            )}
          </>
        )}
      </div>

      {step !== 'menu' && (
        <div className="nj-create-foot">
          <button className={`nj-create-next${enabled ? ' on' : ''}`} onClick={onNext} disabled={!enabled}>
            {step === 'pick' && !single ? t.done : t.next}
          </button>
        </div>
      )}
    </div>
  );
};

export default CreatePanel;
