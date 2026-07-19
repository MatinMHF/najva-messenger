import React, { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useContactsStore } from '../../store/contactsStore';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';
import { createDirectConversation } from '../../lib/conversations';
import { initialsOf, avatarGradient } from '../../utils/avatar';
import {
  deriveLoginKey,
  unwrapMasterKey,
  rewrapMasterKey,
  generateRecoveryCodeShares,
} from '../../lib/crypto/accountKeys';
import { loadMasterKey } from '../../lib/crypto/keystore';
import { passkeysSupported, registerPasskey } from '../../lib/webauthn';
import { enablePush, disablePush, isPushEnabled, pushSupported } from '../../lib/push';

/* ------------------------------------------------------------------ *
 * Sliding settings/profile/contacts panel — faithful port of the
 * SLIDING PANEL region of "Najva Chat.dc.html". A single navigation
 * stack drives every sub-view. Functional sub-views (profile, contacts,
 * change password, reset keys, passkey, push notifications, theme,
 * language, logout) are wired to the real backend; the rest keep local
 * UI state exactly as the design prototype does.
 * ------------------------------------------------------------------ */

// Design copy, inlined per-language so it matches the source design exactly.
const STR = {
  en: {
    back: 'Back', save: 'Save', edit: 'Edit', saved: 'Saved!', confirm: 'Confirm', submit: 'Submit',
    profile: 'Profile', contacts: 'Contacts', settings: 'Settings', account: 'Account',
    name: 'Name', username: 'Username', bio: 'Bio', phone: 'Phone number', email: 'Email', comingSoon: 'Coming soon',
    birthday: 'Date of birth', addBirthday: 'Add a date of birth', year: 'Year',
    bdayHint: 'Day / Month / Year — type the year manually',
    security: 'Security', notifications: 'Notification Settings', chatSettings: 'Chat Settings', speaker: 'Speaker and Camera',
    language: 'Language', appSize: 'Default App Size', support: 'Support and Suggestions',
    addPasskey: 'Add Passkey', changePassword: 'Change Password', resetKeys: 'Reset Recovery Key', setPin: 'Set an app PIN',
    accountSub: 'Your profile details', securitySub: 'Passkey, password, PIN, privacy', notifSub: 'Sounds and alerts',
    chatSub: 'Theme, font, wallpaper', speakerSub: 'Audio and video devices, calls', supportSub: 'Get help or send ideas',
    whoAddGroups: 'Who can add me to groups & chats', lastSeen: 'Last seen', profilePhoto: 'Profile picture',
    forwards: 'Forwarding messages', calls: 'Calls', sendMsgs: 'Sending messages',
    nobody: 'Nobody', everyone: 'Everyone', contactsOpt: 'Contacts',
    currentPw: 'Current password', newPw: 'New password', confirmPw: 'Confirm new password', pwChanged: 'Password changed!',
    enterPw: 'Enter your password to continue', newKeysTitle: 'Your new recovery keys', copy: 'Copy', copied: 'Copied!',
    pin1: 'Enter a 4-digit PIN', pin2: 'Repeat PIN', pinSet: 'App PIN set!',
    passkeyWait: 'Waiting for your device… confirm with fingerprint, face or PIN', passkeyAdded: 'Passkey added!',
    enableNotifs: 'Enable notifications', privateChats: 'Private chats', users: 'Users', channels: 'Channels',
    notifSound: 'Notification sound', callSound: 'Call sound',
    theme: 'Theme', light: 'Light', dark: 'Dark', font: 'Font', wallpaper: 'Chat wallpaper', gallery: 'Gallery',
    defaultWp: 'Default', teal: 'Teal', sand: 'Sand', forest: 'Forest', night: 'Night',
    outputDevice: 'Output device', inputDevice: 'Input device', cameraDevice: 'Camera device', acceptVoice: 'Accept voice and video calls',
    appSizeNote: 'Changes apply and save automatically.', sizeDone: 'Default app size updated.',
    supportOpt: 'Support', suggestions: 'Suggestions', recentChats: 'Recent chats',
    supportFormSub: 'Open a ticket with our team', suggestSub: 'Share an idea with us', recentSub: 'Open and closed tickets',
    subject: 'Subject', describeIssue: 'Describe the issue', describeSuggestion: 'Describe your suggestion',
    suggestThanks: 'Thank you! Our support team will review your suggestion.',
    open: 'Open', closed: 'Closed', noTickets: 'No support chats yet.',
    online: 'Online', offline: 'Offline', search: 'Search', logout: 'Log Out', logoutQ: 'Are you sure you want to log out?',
    yes: 'Yes', cancel: 'Cancel', noContacts: 'No contacts yet. Search to start a chat.', noResults: 'No users found',
    changePhoto: 'Change photo',
  },
  fa: {
    back: 'بازگشت', save: 'ذخیره', edit: 'ویرایش', saved: 'ذخیره شد!', confirm: 'تأیید', submit: 'ارسال',
    profile: 'پروفایل', contacts: 'مخاطبین', settings: 'تنظیمات', account: 'حساب کاربری',
    name: 'نام', username: 'نام کاربری', bio: 'بیوگرافی', phone: 'شماره تلفن', email: 'ایمیل', comingSoon: 'به‌زودی',
    birthday: 'تاریخ تولد', addBirthday: 'افزودن تاریخ تولد', year: 'سال',
    bdayHint: 'روز / ماه / سال — سال را به‌صورت دستی وارد کنید',
    security: 'امنیت', notifications: 'تنظیمات اعلان‌ها', chatSettings: 'تنظیمات چت', speaker: 'بلندگو و دوربین',
    language: 'زبان', appSize: 'اندازه پیش‌فرض برنامه', support: 'پشتیبانی و پیشنهادها',
    addPasskey: 'افزودن کلید عبور', changePassword: 'تغییر رمز عبور', resetKeys: 'بازنشانی کلیدهای بازیابی', setPin: 'تنظیم پین برنامه',
    accountSub: 'مشخصات پروفایل شما', securitySub: 'کلید عبور، رمز، پین، حریم خصوصی', notifSub: 'صداها و هشدارها',
    chatSub: 'پوسته، قلم، پس‌زمینه', speakerSub: 'دستگاه‌های صوتی و تصویری و تماس‌ها', supportSub: 'دریافت کمک یا ارسال ایده',
    whoAddGroups: 'چه کسی می‌تواند مرا به گروه‌ها اضافه کند', lastSeen: 'آخرین بازدید', profilePhoto: 'عکس پروفایل',
    forwards: 'بازارسال پیام‌ها', calls: 'تماس‌ها', sendMsgs: 'ارسال پیام',
    nobody: 'هیچ‌کس', everyone: 'همه', contactsOpt: 'مخاطبین',
    currentPw: 'رمز عبور فعلی', newPw: 'رمز عبور جدید', confirmPw: 'تکرار رمز عبور جدید', pwChanged: 'رمز عبور تغییر کرد!',
    enterPw: 'برای ادامه رمز عبور خود را وارد کنید', newKeysTitle: 'کلیدهای بازیابی جدید شما', copy: 'کپی', copied: 'کپی شد!',
    pin1: 'یک پین ۴ رقمی وارد کنید', pin2: 'تکرار پین', pinSet: 'پین برنامه تنظیم شد!',
    passkeyWait: 'در انتظار دستگاه شما… با اثر انگشت، چهره یا پین تأیید کنید', passkeyAdded: 'کلید عبور افزوده شد!',
    enableNotifs: 'فعال‌سازی اعلان‌ها', privateChats: 'چت‌های خصوصی', users: 'کاربران', channels: 'کانال‌ها',
    notifSound: 'صدای اعلان', callSound: 'صدای تماس',
    theme: 'پوسته', light: 'روشن', dark: 'تیره', font: 'قلم', wallpaper: 'پس‌زمینه چت', gallery: 'گالری',
    defaultWp: 'پیش‌فرض', teal: 'فیروزه‌ای', sand: 'شنی', forest: 'جنگلی', night: 'شب',
    outputDevice: 'دستگاه خروجی صدا', inputDevice: 'دستگاه ورودی صدا', cameraDevice: 'دستگاه دوربین', acceptVoice: 'پذیرش تماس صوتی و تصویری',
    appSizeNote: 'تغییرات به‌صورت خودکار اعمال و ذخیره می‌شوند.', sizeDone: 'اندازه پیش‌فرض برنامه اعمال شد.',
    supportOpt: 'پشتیبانی', suggestions: 'پیشنهادها', recentChats: 'چت‌های اخیر',
    supportFormSub: 'ثبت درخواست برای تیم ما', suggestSub: 'ایده خود را با ما در میان بگذارید', recentSub: 'درخواست‌های باز و بسته',
    subject: 'موضوع', describeIssue: 'شرح مشکل', describeSuggestion: 'شرح پیشنهاد شما',
    suggestThanks: 'متشکریم! تیم پشتیبانی پیشنهاد شما را بررسی خواهد کرد.',
    open: 'باز', closed: 'بسته', noTickets: 'هنوز چت پشتیبانی ندارید.',
    online: 'آنلاین', offline: 'آفلاین', search: 'جستجو', logout: 'خروج از حساب', logoutQ: 'آیا مطمئن هستید که می‌خواهید خارج شوید؟',
    yes: 'بله', cancel: 'لغو', noContacts: 'هنوز مخاطبی نیست. برای شروع چت جستجو کنید.', noResults: 'کاربری یافت نشد',
    changePhoto: 'تغییر عکس',
  },
} as const;

const PANEL_TRIGGERS = ['profile', 'contacts', 'settings'];

// Small inline SVG icon from an array of path `d` strings (design's this.svg()).
const Svg: React.FC<{ paths: string[]; size?: number; sw?: number }> = ({ paths, size = 20, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {paths.map((d, i) => (
      <path key={i} d={d} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
);

const Chevron = () => (
  <svg className="nj-listrow-chev" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Check = ({ size = 28, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5 L10 18.5 L20 6.5" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TEAL = { iconColor: '#1e8a96', iconBg: 'rgba(30,138,150,0.1)' };
const AMBER = { iconColor: '#e08c0b', iconBg: 'rgba(245,166,35,0.13)' };

interface ListRowDef {
  key: string;
  label: string;
  sub?: string;
  paths: string[];
  tone: typeof TEAL;
  onClick: () => void;
  danger?: boolean;
}

const SlidingPanel: React.FC = () => {
  const { i18n } = useTranslation();
  const { activeModal, setActiveModal, theme, toggleTheme, language, setLanguage } = useUIStore();
  const { user, updateUser, logout } = useAuthStore() as any;
  const { setChats, setActiveChat } = useChatStore();
  const { contacts, setContacts } = useContactsStore();

  const lang = (language === 'fa' ? 'fa' : 'en') as 'en' | 'fa';
  const t = STR[lang];

  // navigation stack
  const [nav, setNav] = useState<string[]>([]);
  const top = nav[nav.length - 1] || '';

  // sync the stack with the sidebar dropdown trigger
  useEffect(() => {
    if (activeModal && PANEL_TRIGGERS.includes(activeModal)) {
      setNav([activeModal === 'profile' ? 'profile' : activeModal]);
    } else if (nav.length) {
      setNav([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModal]);

  const push = (v: string) => setNav((s) => [...s, v]);
  const pop = () => {
    setNav((s) => {
      const next = s.slice(0, -1);
      if (next.length === 0) setActiveModal(null);
      return next;
    });
  };
  const close = () => { setNav([]); setActiveModal(null); };

  // ---------- profile ----------
  const [editField, setEditField] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const flashRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const flash = () => {
    setSavedFlash(true);
    clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setSavedFlash(false), 1800);
  };

  const saveProfile = async (patch: { displayName?: string; bio?: string }) => {
    try {
      const res = await api.put('/users/profile', patch);
      updateUser(res.data);
      setEditField(null);
      flash();
    } catch (e) {
      console.error('profile update failed', e);
    }
  };

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateUser({ avatarUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  // ---------- contacts ----------
  const [contactQ, setContactQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (top !== 'contacts') return;
    api.get('/contacts').then((r) => setContacts(r.data)).catch(() => {});
  }, [top, setContacts]);

  useEffect(() => {
    if (top !== 'contacts' || contactQ.trim().length === 0) { setSearchResults([]); return; }
    setSearching(true);
    const d = setTimeout(async () => {
      try {
        const r = await api.get(`/users/search?q=${encodeURIComponent(contactQ)}`);
        setSearchResults(r.data.filter((u: any) => u.id !== user?.id));
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 450);
    return () => clearTimeout(d);
  }, [contactQ, top, user?.id]);

  const openDm = async (c: { id: string; displayName?: string; username?: string; status?: string; lastSeen?: string }) => {
    try {
      if (!user?.id) return;
      const name = c.displayName || c.username || 'User';
      const conv = await createDirectConversation(user.id, c.id);
      setChats([{ id: conv.id, type: 'direct', participants: [name], unreadCount: 0, currentKeyVersion: conv.currentKeyVersion ?? 1, role: 'ADMIN', peerId: c.id, peerStatus: c.status, peerLastSeen: c.lastSeen ?? null }]);
      setActiveChat(conv.id);
      close();
    } catch (e) { console.error(e); }
  };

  // ---------- local UI state (matches prototype) ----------
  const [privacy, setPrivacy] = useState<Record<string, string>>({
    addGroups: 'everyone', lastSeen: 'everyone', profilePhoto: 'everyone', phone: 'nobody', forwards: 'everyone', calls: 'everyone', sendMsgs: 'everyone',
  });
  const [notifMaster, setNotifMaster] = useState(true);
  const [notifCats, setNotifCats] = useState({ private: true, users: true, channels: true });
  const [notifSound, setNotifSound] = useState('Chime');
  const [callSound, setCallSound] = useState('Pulse');
  const [fontName, setFontName] = useState(() => localStorage.getItem('najva-font') || (lang === 'fa' ? 'Vazirmatn' : 'Nunito Sans'));
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('najva-wallpaper') || 'default');
  const [speakerOut, setSpeakerOut] = useState(() => localStorage.getItem('najva-speakerOut') || 'System default');
  const [micIn, setMicIn] = useState(() => localStorage.getItem('najva-micIn') || 'System default');
  const [camDev, setCamDev] = useState(() => localStorage.getItem('najva-camDev') || 'System default');
  const [allowVoice, setAllowVoice] = useState(true);

  const [audioInputs, setAudioInputs] = useState<{label: string; value: string}[]>([{ label: 'System default', value: 'System default' }]);
  const [audioOutputs, setAudioOutputs] = useState<{label: string; value: string}[]>([{ label: 'System default', value: 'System default' }]);
  const [videoInputs, setVideoInputs] = useState<{label: string; value: string}[]>([{ label: 'System default', value: 'System default' }]);

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const aIn: {label: string; value: string}[] = [{ label: 'System default', value: 'System default' }];
        const aOut: {label: string; value: string}[] = [{ label: 'System default', value: 'System default' }];
        const vIn: {label: string; value: string}[] = [{ label: 'System default', value: 'System default' }];
        
        devices.forEach(d => {
          if (d.kind === 'audioinput') aIn.push({ label: d.label || `Microphone ${aIn.length}`, value: d.deviceId });
          else if (d.kind === 'audiooutput') aOut.push({ label: d.label || `Speaker ${aOut.length}`, value: d.deviceId });
          else if (d.kind === 'videoinput') vIn.push({ label: d.label || `Camera ${vIn.length}`, value: d.deviceId });
        });
        setAudioInputs(aIn);
        setAudioOutputs(aOut);
        setVideoInputs(vIn);
      } catch (e) {
        console.warn('Could not enumerate devices', e);
      }
    }
    if (top === 'speaker') void loadDevices();
  }, [top]);
  const [appSize, setAppSize] = useState(() => parseInt(localStorage.getItem('najva-zoom') || '100', 10));
  const [sizeToast, setSizeToast] = useState(false);
  const toastRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // push subscription reflects the real browser state
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => { if (top === 'notifications') void isPushEnabled().then(setPushOn); }, [top]);

  const onAppSize = (v: number) => {
    setAppSize(v);
    localStorage.setItem('najva-zoom', String(v));
    (document.body.style as any).zoom = String(v / 100);
    setSizeToast(true);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setSizeToast(false), 2200);
  };

  // ---------- forms (change pw, reset keys, pin, support) ----------
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [flowSuccess, setFlowSuccess] = useState('');
  const [newKeys, setNewKeys] = useState<string[] | null>(null);
  const [keysCopied, setKeysCopied] = useState(false);
  const setF = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  // passkey flow
  const [pkWaiting, setPkWaiting] = useState(false);
  const [pkDone, setPkDone] = useState(false);

  // support tickets (local)
  const [tickets, setTickets] = useState<{ id: string; subject: string; desc: string; status: string }[]>([]);
  const [suggestThanks, setSuggestThanks] = useState(false);

  // reset all transient sub-view state when entering a fresh view
  const resetFlow = () => { setForm({}); setFormError(''); setFlowSuccess(''); setNewKeys(null); setKeysCopied(false); setPkWaiting(false); setPkDone(false); setSuggestThanks(false); };
  const goto = (v: string) => { resetFlow(); push(v); };

  // in-panel logout confirm
  const [confirmLogout, setConfirmLogout] = useState(false);

  const toggleLanguage = (v: 'en' | 'fa') => { setLanguage(v); i18n.changeLanguage(v); };

  if (!activeModal || !PANEL_TRIGGERS.includes(activeModal)) return null;
  if (!user) return null;

  const titles: Record<string, string> = {
    profile: t.profile, account: t.account, contacts: t.contacts, settings: t.settings,
    security: t.security, notifications: t.notifications, chatset: t.chatSettings, speaker: t.speaker,
    support: t.support, changepw: t.changePassword, resetkeys: t.resetKeys, pin: t.setPin, passkey: t.addPasskey,
    'support-form': t.supportOpt, 'suggest-form': t.suggestions, recent: t.recentChats,
  };

  const myName = user.displayName || user.username || 'User';

  /* ---------------- profile view ---------------- */
  const renderProfile = () => {
    const fields = [
      { key: 'name', label: t.name, value: user.displayName || user.username, canEdit: true },
      { key: 'username', label: t.username, value: '@' + user.username, canEdit: false },
      { key: 'bio', label: t.bio, value: user.bio || '', empty: true, canEdit: true },
      { key: 'phone', label: t.phone, value: '', soon: true, canEdit: false },
      { key: 'email', label: t.email, value: '', soon: true, canEdit: false },
    ];
    return (
      <>
        <div className="nj-pf-head">
          <div className="nj-pf-avatar" style={{ background: user.avatarUrl ? 'transparent' : avatarGradient(myName) }}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt={myName} /> : initialsOf(myName)}
            <label className="nj-pf-cam" title={t.changePhoto}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 8h3l2-2.5h6L17 8h3v11H4V8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="2" /></svg>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
            </label>
          </div>
          <div>
            <div className="nj-pf-name">{user.displayName || user.username}</div>
            <div className="nj-pf-username">@{user.username}</div>
          </div>
        </div>

        {fields.map((f, i) => {
          const editing = editField === f.key;
          return (
            <div key={f.key} className="nj-field" style={{ animationDelay: `${Math.min(i * 45, 320)}ms` }}>
              <div className="nj-field-top">
                <span className="nj-field-label">{f.label}</span>
                {f.soon && (
                  <span className="nj-field-soon">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
                    {t.comingSoon}
                  </span>
                )}
              </div>
              {editing ? (
                <div className="nj-field-edit">
                  <input
                    className="nj-field-input"
                    value={f.key === 'name' ? draftName : draftBio}
                    placeholder={f.label}
                    onChange={(e) => (f.key === 'name' ? setDraftName(e.target.value) : setDraftBio(e.target.value))}
                    autoFocus
                  />
                  <button
                    className="nj-field-save"
                    onClick={() => saveProfile(f.key === 'name' ? { displayName: draftName } : { bio: draftBio })}
                  >
                    {t.save}
                  </button>
                </div>
              ) : (
                <div className="nj-field-view">
                  <span className={`nj-field-value ${!f.value ? 'empty' : ''}`}>{f.value || '—'}</span>
                  {f.canEdit && (
                    <button
                      className="nj-field-editbtn"
                      title={t.edit}
                      onClick={() => { setEditField(f.key); setDraftName(user.displayName || user.username || ''); setDraftBio(user.bio || ''); }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M14.5 7.5l3 3" stroke="currentColor" strokeWidth="2" /></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {savedFlash && <div className="nj-flash">{t.saved}</div>}
      </>
    );
  };

  /* ---------------- contacts view ---------------- */
  const renderContacts = () => {
    const showSearch = contactQ.trim().length > 0;
    const rows = showSearch ? searchResults : contacts;
    return (
      <>
        <input className="nj-contact-search" placeholder={t.search} value={contactQ} onChange={(e) => setContactQ(e.target.value)} />
        {searching && <div className="nj-empty-note">…</div>}
        {!searching && rows.length === 0 && (
          <div className="nj-empty-note">{showSearch ? t.noResults : t.noContacts}</div>
        )}
        {rows.map((c: any) => {
          const nm = c.displayName || c.username;
          return (
            <div key={c.id} className="nj-contact-row" onClick={() => openDm(c)}>
              <div className="nj-contact-avatar" style={{ background: avatarGradient(nm) }}>{initialsOf(nm)}</div>
              <div className="nj-contact-info">
                <span className="nj-contact-name">{nm}</span>
                <span className="nj-contact-sub">{c.status === 'ONLINE' ? t.online : t.offline}</span>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  /* ---------------- generic list rows ---------------- */
  const ListRows: React.FC<{ rows: ListRowDef[] }> = ({ rows }) => (
    <>
      {rows.map((r, i) => (
        <button key={r.key} className={`nj-listrow ${r.danger ? 'danger' : ''}`} onClick={r.onClick} style={{ animationDelay: `${Math.min(i * 45, 320)}ms` }}>
          <span className="nj-listrow-icon" style={{ color: r.tone.iconColor, background: r.tone.iconBg }}><Svg paths={r.paths} /></span>
          <span className="nj-listrow-text">
            <span className="nj-listrow-label">{r.label}</span>
            {r.sub && <span className="nj-listrow-sub">{r.sub}</span>}
          </span>
          <Chevron />
        </button>
      ))}
    </>
  );

  const ToggleRow: React.FC<{ label: string; sub?: string; on: boolean; dim?: boolean; onToggle: () => void }> = ({ label, sub, on, dim, onToggle }) => (
    <div className={`nj-toggle-row ${dim ? 'dim' : ''}`}>
      <span className="nj-toggle-text">
        <span className="nj-toggle-label">{label}</span>
        {sub && <span className="nj-toggle-sub">{sub}</span>}
      </span>
      <button className={`nj-toggle ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}><span className="nj-toggle-knob" /></button>
    </div>
  );

  const SelectRow: React.FC<{ label: string; value: string; options: ({label: string; value: string} | string)[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
    <div className="nj-select-row">
      <span className="nj-select-label">{label}</span>
      <select className="nj-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lbl = typeof o === 'string' ? o : o.label;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    </div>
  );

  const ChoiceGroup: React.FC<{ label: string; value: string; opts: [string, string][]; onPick: (v: string) => void }> = ({ label, value, opts, onPick }) => (
    <div className="nj-choice">
      <span className="nj-choice-label">{label}</span>
      <div className="nj-choice-opts">
        {opts.map(([v, l]) => (
          <button key={v} className={`nj-choice-btn ${value === v ? 'active' : ''}`} onClick={() => onPick(v)}>{l}</button>
        ))}
      </div>
    </div>
  );

  /* ---------------- settings menu ---------------- */
  const renderSettings = () => {
    const rows: ListRowDef[] = [
      { key: 'account', label: t.account, sub: t.accountSub, paths: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6'], tone: TEAL, onClick: () => goto('account') },
      { key: 'security', label: t.security, sub: t.securitySub, paths: ['M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z', 'M9 12l2 2 4-4'], tone: TEAL, onClick: () => goto('security') },
      { key: 'notifications', label: t.notifications, sub: t.notifSub, paths: ['M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z', 'M10 19a2 2 0 0 0 4 0'], tone: AMBER, onClick: () => goto('notifications') },
      { key: 'chatset', label: t.chatSettings, sub: t.chatSub, paths: ['M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12Z'], tone: TEAL, onClick: () => goto('chatset') },
      { key: 'speaker', label: t.speaker, sub: t.speakerSub, paths: ['M4 9v6h3l6 4V5L7 9H4Z', 'M17 9a4 4 0 0 1 0 6'], tone: AMBER, onClick: () => goto('speaker') },
      { key: 'support', label: t.support, sub: t.supportSub, paths: ['M4 13a8 8 0 1 1 16 0', 'M4 13v3a2 2 0 0 0 2 2h1v-5H4Z', 'M20 13v3a2 2 0 0 1-2 2h-1v-5h3Z'], tone: AMBER, onClick: () => goto('support') },
    ];
    return (
      <>
        <ListRows rows={rows} />
        <ChoiceGroup label={t.language} value={lang} opts={[['en', 'English'], ['fa', 'فارسی']]} onPick={(v) => toggleLanguage(v as 'en' | 'fa')} />
        <div className="nj-appsize">
          <div className="nj-appsize-top">
            <span className="nj-appsize-label">{t.appSize}</span>
            <span className="nj-appsize-val">{appSize}%</span>
          </div>
          <input type="range" min={50} max={200} step={10} value={appSize} onChange={(e) => onAppSize(parseInt(e.target.value, 10))} />
          <div className="nj-appsize-scale"><span>50%</span><span>100%</span><span>200%</span></div>
          <div className="nj-appsize-note">{t.appSizeNote}</div>
        </div>
        <button className="nj-listrow danger" onClick={() => setConfirmLogout(true)}>
          <span className="nj-listrow-icon" style={{ color: '#e05242', background: 'rgba(224,82,66,0.12)' }}>
            <Svg paths={['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']} />
          </span>
          <span className="nj-listrow-text"><span className="nj-listrow-label">{t.logout}</span></span>
        </button>
        {confirmLogout && (
          <div className="nj-choice" style={{ borderColor: 'rgba(224,82,66,0.4)' }}>
            <span className="nj-choice-label">{t.logoutQ}</span>
            <div className="nj-choice-opts">
              <button className="nj-form-submit" style={{ background: '#e05242', padding: '9px 18px', borderRadius: 9 }} onClick={() => { logout(); }}>{t.yes}</button>
              <button className="nj-choice-btn" onClick={() => setConfirmLogout(false)}>{t.cancel}</button>
            </div>
          </div>
        )}
      </>
    );
  };

  /* ---------------- security ---------------- */
  const startPasskey = async () => {
    resetFlow();
    push('passkey');
    setPkWaiting(true);
    try {
      const mk = user ? await loadMasterKey(user.id) : null;
      if (!mk) { setPkWaiting(false); setFormError('key'); pop(); return; }
      try { await registerPasskey(t.addPasskey, mk); } finally { mk.fill(0); }
      setPkWaiting(false); setPkDone(true);
    } catch { setPkWaiting(false); pop(); }
  };

  const renderSecurity = () => {
    const rows: ListRowDef[] = [
      ...(passkeysSupported() ? [{ key: 'passkey', label: t.addPasskey, paths: ['M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M3 21c0-3.3 2.7-6 6-6', 'M15 16l2-2 2 2-2 2-2-2Z', 'M17 14v7'], tone: TEAL, onClick: startPasskey }] : []),
      { key: 'changepw', label: t.changePassword, paths: ['M6 11h12v9H6v-9Z', 'M9 11V7a3 3 0 0 1 6 0v4'], tone: AMBER, onClick: () => goto('changepw') },
      { key: 'resetkeys', label: t.resetKeys, paths: ['M8 18.5A4.5 4.5 0 1 0 8 9.5a4.5 4.5 0 0 0 0 9Z', 'M11.5 10.5 L20 2M16 6l2.5 2.5'], tone: TEAL, onClick: () => goto('resetkeys') },
      { key: 'pin', label: t.setPin, paths: ['M5 8h14v12H5V8Z', 'M12 13v3', 'M9 8V6a3 3 0 0 1 6 0v2'], tone: AMBER, onClick: () => goto('pin') },
    ];
    const privRows: [string, string][] = [
      ['addGroups', t.whoAddGroups], ['lastSeen', t.lastSeen], ['profilePhoto', t.profilePhoto],
      ['phone', t.phone], ['forwards', t.forwards], ['calls', t.calls], ['sendMsgs', t.sendMsgs],
    ];
    const privOpts: [string, string][] = [['everyone', t.everyone], ['contacts', t.contactsOpt], ['nobody', t.nobody]];
    return (
      <>
        <ListRows rows={rows} />
        {privRows.map(([k, l]) => (
          <ChoiceGroup key={k} label={l} value={privacy[k]} opts={privOpts} onPick={(v) => setPrivacy((s) => ({ ...s, [k]: v }))} />
        ))}
      </>
    );
  };

  /* ---------------- notifications ---------------- */
  const renderNotifications = () => {
    const sounds = ['Chime', 'Pulse', 'Aria', 'Marimba', 'Silent'];
    return (
      <>
        <ToggleRow label={t.enableNotifs} on={notifMaster && (pushSupported() ? pushOn : true)} onToggle={async () => {
          if (pushSupported()) {
            if (pushOn) { await disablePush(); setPushOn(false); setNotifMaster(false); }
            else { const ok = await enablePush(); setPushOn(ok); setNotifMaster(ok); }
          } else setNotifMaster((v) => !v);
        }} />
        <ToggleRow label={t.privateChats} dim={!notifMaster} on={notifCats.private && notifMaster} onToggle={() => setNotifCats((s) => ({ ...s, private: !s.private }))} />
        <ToggleRow label={t.users} dim={!notifMaster} on={notifCats.users && notifMaster} onToggle={() => setNotifCats((s) => ({ ...s, users: !s.users }))} />
        <ToggleRow label={t.channels} dim={!notifMaster} on={notifCats.channels && notifMaster} onToggle={() => setNotifCats((s) => ({ ...s, channels: !s.channels }))} />
        <SelectRow label={t.notifSound} value={notifSound} options={sounds} onChange={setNotifSound} />
        <SelectRow label={t.callSound} value={callSound} options={sounds} onChange={setCallSound} />
      </>
    );
  };

  /* ---------------- chat settings ---------------- */
  const renderChatSettings = () => {
    const wpDefs: [string, string, string][] = [
      ['default', t.defaultWp, 'var(--nj-input-bg)'],
      ['teal', t.teal, 'linear-gradient(135deg,#1e8a96,#14707c)'],
      ['sand', t.sand, 'linear-gradient(135deg,#f5cf7f,#e0a04b)'],
      ['forest', t.forest, 'linear-gradient(135deg,#4f9d6b,#2f6d47)'],
      ['night', t.night, 'linear-gradient(135deg,#243b53,#0e2233)'],
    ];
    return (
      <>
        <ChoiceGroup label={t.theme} value={theme} opts={[['light', t.light], ['dark', t.dark]]} onPick={(v) => { if (v !== theme) toggleTheme(); }} />
        <SelectRow label={t.font} value={fontName} options={['Nunito Sans', 'Vazirmatn', 'System']} onChange={(v) => { setFontName(v); localStorage.setItem('najva-font', v); }} />
        <div className="nj-select-row">
          <span className="nj-select-label">{t.wallpaper}</span>
          <div className="nj-wp-grid">
            {wpDefs.map(([v, l, bg]) => (
              <div key={v} className={`nj-wp ${wallpaper === v ? 'active' : ''}`} style={{ background: bg }} onClick={() => { setWallpaper(v); localStorage.setItem('najva-wallpaper', v); }}>
                {wallpaper === v && <span className="nj-wp-check"><Check size={12} /></span>}
                <span className="nj-wp-label">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  /* ---------------- speaker ---------------- */
  const renderSpeaker = () => (
    <>
      <SelectRow label={t.outputDevice} value={speakerOut} options={audioOutputs} onChange={(v) => { setSpeakerOut(v); localStorage.setItem('najva-speakerOut', v); }} />
      <SelectRow label={t.inputDevice} value={micIn} options={audioInputs} onChange={(v) => { setMicIn(v); localStorage.setItem('najva-micIn', v); }} />
      <SelectRow label={t.cameraDevice} value={camDev} options={videoInputs} onChange={(v) => { setCamDev(v); localStorage.setItem('najva-camDev', v); }} />
      <ToggleRow label={t.acceptVoice} on={allowVoice} onToggle={() => setAllowVoice((v) => !v)} />
    </>
  );

  /* ---------------- forms ---------------- */
  const submitChangePw = async () => {
    setFormError('');
    if (!form.cur) return setFormError(t.currentPw);
    if ((form.new1 || '').length < 8) return setFormError(lang === 'fa' ? 'رمز عبور باید حداقل ۸ نویسه باشد.' : 'Password must be at least 8 characters.');
    if (form.new1 !== form.new2) return setFormError(lang === 'fa' ? 'رمزهای عبور یکسان نیستند.' : "Passwords don't match.");
    setFormBusy(true);
    try {
      const km = (await api.get('/auth/keys/master')).data;
      const derived = await deriveLoginKey(form.cur, km.kekSalt, km.kekIterations);
      let mk: Uint8Array;
      try { mk = await unwrapMasterKey(derived.kek, km.mkPasswordWrapped); }
      catch { setFormBusy(false); return setFormError(lang === 'fa' ? 'رمز عبور فعلی نادرست است.' : 'Your current password is incorrect.'); }
      const rewrapped = await rewrapMasterKey(mk, form.new1);
      mk.fill(0);
      await api.post('/auth/password/change', {
        currentLoginKey: derived.loginKeyHex, newLoginKey: rewrapped.loginKey,
        newKekSalt: rewrapped.kekSalt, newKekIterations: rewrapped.kekIterations,
        newMkPasswordWrapped: rewrapped.mkPasswordWrapped,
      });
      setFlowSuccess(t.pwChanged);
    } catch (e: any) {
      setFormError(e.response?.status === 401 ? (lang === 'fa' ? 'رمز عبور فعلی نادرست است.' : 'Your current password is incorrect.') : (lang === 'fa' ? 'خطایی رخ داد.' : 'An error occurred.'));
    } finally { setFormBusy(false); }
  };

  const submitResetKeys = async () => {
    setFormError('');
    if (!form.pw) return setFormError(t.enterPw);
    setFormBusy(true);
    try {
      const km = (await api.get('/auth/keys/master')).data;
      const derived = await deriveLoginKey(form.pw, km.kekSalt, km.kekIterations);
      let mk: Uint8Array;
      try { mk = await unwrapMasterKey(derived.kek, km.mkPasswordWrapped); }
      catch { setFormBusy(false); return setFormError(lang === 'fa' ? 'رمز عبور نادرست است.' : 'Your password is incorrect.'); }
      const { recoveryCodes, recoveryCodesDisplay } = await generateRecoveryCodeShares(mk);
      mk.fill(0);
      await api.post('/auth/recovery/reset', { loginKey: derived.loginKeyHex, totpCode: form.totp?.trim() || undefined, recoveryCodes });
      setNewKeys(recoveryCodesDisplay);
    } catch (e: any) {
      setFormError(e.response?.status === 401 ? (lang === 'fa' ? 'رمز عبور نادرست است.' : 'Your password is incorrect.') : (lang === 'fa' ? 'خطایی رخ داد.' : 'An error occurred.'));
    } finally { setFormBusy(false); }
  };

  const submitPin = () => {
    setFormError('');
    if (!/^\d{4}$/.test(form.p1 || '')) return setFormError(t.pin1);
    if (form.p1 !== form.p2) return setFormError(lang === 'fa' ? 'پین‌ها یکسان نیستند.' : "PINs don't match.");
    localStorage.setItem('najva-pin', form.p1);
    setFlowSuccess(t.pinSet);
  };

  const FormPanel: React.FC<{ fields: { key: string; label: string; type?: string; area?: boolean; ph?: string; center?: boolean; max?: number }[]; submitLabel: string; onSubmit: () => void; extraTotp?: boolean }> = ({ fields, submitLabel, onSubmit }) => (
    <>
      {fields.map((f) => (
        <label key={f.key} className="nj-form-field">
          <span className="nj-form-label">{f.label}</span>
          {f.area ? (
            <textarea className="nj-form-area" rows={4} placeholder={f.ph} value={form[f.key] || ''} onChange={(e) => setF(f.key, e.target.value)} />
          ) : (
            <input
              className="nj-form-input" type={f.type || 'text'} placeholder={f.ph} maxLength={f.max}
              value={form[f.key] || ''} onChange={(e) => setF(f.key, e.target.value)}
              style={f.center ? { textAlign: 'center', letterSpacing: '0.4em' } : undefined}
            />
          )}
        </label>
      ))}
      {formError && <div className="nj-form-error">{formError}</div>}
      <button className="nj-form-submit" disabled={formBusy} onClick={onSubmit}>{formBusy ? '…' : submitLabel}</button>
    </>
  );

  const SuccessFlash: React.FC<{ text: string }> = ({ text }) => (
    <div className="nj-success">
      <div className="nj-success-ring"><Check /></div>
      <span className="nj-success-text">{text}</span>
    </div>
  );

  const renderChangePw = () => flowSuccess
    ? <SuccessFlash text={flowSuccess} />
    : <FormPanel
        fields={[{ key: 'cur', label: t.currentPw, type: 'password' }, { key: 'new1', label: t.newPw, type: 'password' }, { key: 'new2', label: t.confirmPw, type: 'password' }]}
        submitLabel={t.save} onSubmit={submitChangePw} />;

  const renderResetKeys = () => {
    if (newKeys) {
      return (
        <>
          <div className="nj-flash">{t.newKeysTitle}</div>
          <div className="nj-keys-grid">{newKeys.map((k, i) => <div key={i} className="nj-key">{k}</div>)}</div>
          <button className={`nj-copy-keys ${keysCopied ? 'copied' : ''}`} onClick={() => { navigator.clipboard.writeText(newKeys.join('\n')); setKeysCopied(true); }}>
            {keysCopied ? t.copied : t.copy}
          </button>
        </>
      );
    }
    return <FormPanel
      fields={[{ key: 'pw', label: t.enterPw, type: 'password' }, ...(user?.totpEnabled ? [{ key: 'totp', label: 'Authenticator code', type: 'text' as const }] : [])]}
      submitLabel={t.confirm} onSubmit={submitResetKeys} />;
  };

  const renderPin = () => flowSuccess
    ? <SuccessFlash text={flowSuccess} />
    : <FormPanel
        fields={[{ key: 'p1', label: t.pin1, type: 'password', center: true, max: 4, ph: '••••' }, { key: 'p2', label: t.pin2, type: 'password', center: true, max: 4, ph: '••••' }]}
        submitLabel={t.save} onSubmit={submitPin} />;

  const renderPasskey = () => (
    <div className="nj-passkey">
      {pkWaiting && (
        <>
          <div className="nj-passkey-wait">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.35 3.2.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="17.5" cy="13.5" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>
          </div>
          <span className="nj-passkey-text">{t.passkeyWait}</span>
        </>
      )}
      {pkDone && (
        <>
          <div className="nj-passkey-done"><Check size={30} /></div>
          <span className="nj-passkey-text done">{t.passkeyAdded}</span>
        </>
      )}
    </div>
  );

  /* ---------------- support ---------------- */
  const submitSupport = () => {
    setFormError('');
    if (!(form.subject || '').trim() || !(form.desc || '').trim()) return setFormError(lang === 'fa' ? 'لطفاً موضوع و توضیحات را وارد کنید.' : 'Please fill in the subject and description.');
    setTickets((s) => [{ id: 'ticket-' + Date.now(), subject: form.subject.trim(), desc: form.desc.trim(), status: 'open' }, ...s]);
    setForm({}); setFormError(''); pop();
  };
  const submitSuggest = () => {
    setFormError('');
    if (!(form.subject || '').trim() || !(form.desc || '').trim()) return setFormError(lang === 'fa' ? 'لطفاً موضوع و توضیحات را وارد کنید.' : 'Please fill in the subject and description.');
    setSuggestThanks(true); setForm({});
  };

  const renderSupport = () => {
    const rows: ListRowDef[] = [
      { key: 'sf', label: t.supportOpt, sub: t.supportFormSub, paths: ['M4 13a8 8 0 1 1 16 0', 'M4 13v3a2 2 0 0 0 2 2h1v-5H4Z', 'M20 13v3a2 2 0 0 1-2 2h-1v-5h3Z'], tone: TEAL, onClick: () => goto('support-form') },
      { key: 'sg', label: t.suggestions, sub: t.suggestSub, paths: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1.5 1.3-1.5 2.1h-4c0-.8-.7-1.5-1.5-2.1A6 6 0 0 1 12 3Z'], tone: AMBER, onClick: () => goto('suggest-form') },
      { key: 'rc', label: t.recentChats, sub: t.recentSub, paths: ['M12 21a9 9 0 1 0-9-9', 'M3 12v-4m0 4h4', 'M12 7v5l3 3'], tone: TEAL, onClick: () => goto('recent') },
    ];
    return <ListRows rows={rows} />;
  };

  const renderRecent = () => tickets.length === 0
    ? <div className="nj-empty-note">{t.noTickets}</div>
    : (
      <>
        {tickets.map((tk) => (
          <button key={tk.id} className="nj-ticket" onClick={() => close()}>
            <div className="nj-ticket-top">
              <span className="nj-ticket-subj">{tk.subject}</span>
              <span className="nj-ticket-status" style={{ color: '#1e8a96', background: 'rgba(30,138,150,0.12)' }}>{tk.status === 'open' ? t.open : t.closed}</span>
            </div>
            <span className="nj-ticket-desc">{tk.desc}</span>
          </button>
        ))}
      </>
    );

  /* ---------------- body switch ---------------- */
  const renderBody = () => {
    switch (top) {
      case 'profile':
      case 'account': return renderProfile();
      case 'contacts': return renderContacts();
      case 'settings': return renderSettings();
      case 'security': return renderSecurity();
      case 'notifications': return renderNotifications();
      case 'chatset': return renderChatSettings();
      case 'speaker': return renderSpeaker();
      case 'support': return renderSupport();
      case 'changepw': return renderChangePw();
      case 'resetkeys': return renderResetKeys();
      case 'pin': return renderPin();
      case 'passkey': return renderPasskey();
      case 'support-form': return <FormPanel fields={[{ key: 'subject', label: t.subject }, { key: 'desc', label: t.describeIssue, area: true }]} submitLabel={t.submit} onSubmit={submitSupport} />;
      case 'suggest-form': return suggestThanks
        ? <div className="nj-success"><div className="nj-success-ring" style={{ background: 'linear-gradient(135deg,#f5a623,#e08c0b)' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.6-9.5-9A5.4 5.4 0 0 1 12 6.5 5.4 5.4 0 0 1 21.5 12c-2.5 4.4-9.5 9-9.5 9Z" fill="#fff" /></svg></div><span className="nj-success-text">{t.suggestThanks}</span></div>
        : <FormPanel fields={[{ key: 'subject', label: t.subject }, { key: 'desc', label: t.describeSuggestion, area: true }]} submitLabel={t.submit} onSubmit={submitSuggest} />;
      case 'recent': return renderRecent();
      default: return null;
    }
  };

  // Design switches presentation on the base view: Settings is a centered
  // dialog with a dark backdrop; Profile/Contacts slide over the whole app.
  const base = nav[0];
  const slideOver = base === 'profile' || base === 'contacts';

  return (
    <div className={`nj-panel-overlay ${slideOver ? 'slideover' : ''}`} onClick={slideOver ? undefined : close}>
      <div className={`nj-panel ${slideOver ? 'nj-panel-full' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="nj-panel-head">
          <button className="nj-panel-back" onClick={pop} title={t.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="nj-panel-title">{titles[top] || ''}</span>
        </div>
        <div className="nj-panel-body">{renderBody()}</div>
      </div>
      {sizeToast && <div className="nj-toast"><Check size={15} color="currentColor" />{t.sizeDone}</div>}
    </div>
  );
};

export default SlidingPanel;
