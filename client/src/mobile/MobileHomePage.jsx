import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Dot,
  ExternalLink,
  Info,
  LayoutGrid,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings2,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from './MobileLayout';
import styles from './MobileHomePage.module.css';
import { getAllWorkspaces, createWorkspace, deleteWorkspace, duplicateWorkspace, updateWorkspace } from '../http/workspaceAPI';
import {
  approveGroupJoinRequest,
  createGroup,
  createGroupDesk,
  deleteGroup,
  denyGroupJoinRequest,
  getGroupDesks,
  getGroupJoinRequests,
  getGroupMembers,
  getMyGroups,
  inviteToGroup,
  regenerateGroupInviteCode,
  removeGroupMember,
  setGroupMemberRole,
  updateGroup,
} from '../http/groupAPI';
import { getMyCalendar } from '../http/calendarAPI';
import { getToken } from '../http/userAPI';
import UserMenu from '../components/UserMenu';

const COLLAPSE_STORAGE_KEY = 'healis.mobile.home.collapsed.v1';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return true;
  } catch {
    return false;
  }
}

function formatDayMonth(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(d);
}

function formatWeekday(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(d);
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
}


function monthParam(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function typeLabel(type) {
  const t = String(type || '').toUpperCase();
  const map = {
    CT: 'ЦТ',
    COLLOQUIUM: 'Коллоквиум',
    EXAM: 'Экзамен',
    DEADLINE: 'Дедлайн',
  };
  return map[t] || t || 'Событие';
}

function eventIconFor(ev) {
  const title = String(ev?.title || '').toLowerCase();
  const type = String(ev?.type || '').toUpperCase();
  if (type.includes('CT') || title.includes('цт')) return CheckCircle2;
  if (title.includes('анатом')) return BookOpen;
  return CalendarDays;
}

function CardRow({ title, onClick, icon: Icon, tint = 'yellow' }) {
  return (
    <button type="button" className={styles.cardRow} onClick={onClick}>
      <span className={`${styles.cardIcon} ${styles[`cardIcon_${tint}`] || ''}`} aria-hidden="true">
        {Icon ? <Icon size={16} /> : <StickyNote size={16} />}
      </span>
      <span className={styles.cardTitle}>{title}</span>
      <ChevronRight size={16} className={styles.chev} aria-hidden="true" />
    </button>
  );
}

function BoardRow({ title, onOpen, onOpenMenu, icon: Icon, tint = 'yellow' }) {
  return (
    <div className={styles.boardRowWrap}>
      <CardRow title={title} onClick={onOpen} icon={Icon} tint={tint} />
      <button
        type="button"
        className={`${styles.boardMenuBtn} tapTarget`}
        onClick={onOpenMenu}
        aria-label="Настройки доски"
        title="Настройки доски"
      >
        <MoreVertical size={18} />
      </button>
    </div>
  );
}

function CollapseButton({ collapsed, onToggle, label }) {
  return (
    <button
      type="button"
      className={`${styles.collapseBtn} tapTarget`}
      onClick={onToggle}
      aria-label={collapsed ? `Развернуть ${label}` : `Свернуть ${label}`}
      title={collapsed ? 'Развернуть' : 'Свернуть'}
    >
      {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
    </button>
  );
}

function CreateBoardSheet({ open, groups, mode, fixedGroupId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setDesc('');
      setGroupId('');
      setBusy(false);
      return;
    }
    if (mode === 'group') {
      const fixed = fixedGroupId != null ? String(fixedGroupId) : '';
      const first = Array.isArray(groups) && groups.length ? String(groups[0]?.groupId || '') : '';
      setGroupId(fixed || first);
    }
  }, [open, mode, groups, fixedGroupId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (mode === 'group') {
        if (!groupId) return;
        await createGroupDesk(Number(groupId), { name: name.trim(), description: desc.trim() || null, type: 'default' });
      } else {
        await createWorkspace({ name: name.trim(), description: desc.trim() || null, type: 'default' });
      }
      onCreated?.();
      onClose?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось создать доску');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const selectedGroup = mode === 'group' ? (Array.isArray(groups) ? groups.find((g) => String(g?.groupId) === String(groupId)) : null) : null;

  return (
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetTitle}>{mode === 'group' ? 'Создать доску в группе' : 'Создать личную доску'}</div>
        <form className={styles.sheetForm} onSubmit={submit}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название *</div>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Учёба" autoFocus />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Описание</div>
            <input className={styles.input} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Опционально" />
          </label>
          {mode === 'group' ? (
            fixedGroupId != null ? (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Группа</div>
                <div className={styles.hint}>{selectedGroup?.name || `Группа #${groupId}`}</div>
              </div>
            ) : (
              <label className={styles.field}>
                <div className={styles.fieldLabel}>Группа</div>
                <select className={styles.select} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  {Array.isArray(groups)
                    ? groups.map((g) => (
                        <option key={g.groupId} value={g.groupId}>
                          {g.name}
                        </option>
                      ))
                    : null}
                </select>
              </label>
            )
          ) : null}

          <div className={styles.sheetActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={busy || !name.trim()}>
              <Plus size={16} />
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateGroupSheet({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createGroup({ name: name.trim(), description: description.trim() || null });
      onCreated?.();
      onClose?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось создать группу');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetTitle}>Создать группу</div>
        <form className={styles.sheetForm} onSubmit={submit}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название *</div>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: ИС-21"
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Описание</div>
            <input
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опционально"
            />
          </label>

          <div className={styles.sheetActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={busy || !name.trim()}>
              {busy ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GroupSettingsSheet({
  open,
  group,
  appOrigin,
  onClose,
  onChanged,
}) {
  const [tab, setTab] = useState('main'); // main | members | link | requests
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [regeneratingInvite, setRegeneratingInvite] = useState(false);

  const canManage = Boolean(group?.myRole === 'OWNER' || group?.myRole === 'ADMIN');
  const canOwner = Boolean(group?.myRole === 'OWNER');

  useEffect(() => {
    if (!open) return;
    setTab('main');
    setDraftName(String(group?.name || ''));
    setMembers([]);
    setRequests([]);
    setInviteUsername('');
    setMemberSearch('');
    setSaving(false);
    setLoadingMembers(false);
    setLoadingRequests(false);
    setRegeneratingInvite(false);
  }, [open, group?.groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMembers = useCallback(async () => {
    if (!group?.groupId) return;
    setLoadingMembers(true);
    try {
      const rows = await getGroupMembers(group.groupId);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [group?.groupId]);

  const loadRequests = useCallback(async () => {
    if (!group?.groupId) return;
    setLoadingRequests(true);
    try {
      const rows = await getGroupJoinRequests(group.groupId);
      setRequests(Array.isArray(rows) ? rows : []);
    } catch {
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [group?.groupId]);

  useEffect(() => {
    if (!open) return;
    if (tab === 'members') loadMembers();
    if (tab === 'requests') loadRequests();
  }, [open, tab, loadMembers, loadRequests]);

  const saveName = async () => {
    if (!group?.groupId) return;
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await updateGroup(group.groupId, { name, description: group?.description ?? undefined });
      await onChanged?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const deleteThisGroup = async () => {
    if (!group?.groupId) return;
    if (!canOwner) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`Удалить группу "${group?.name || ''}"? Это удалит все доски группы.`);
    if (!ok) return;
    try {
      await deleteGroup(group.groupId);
      onClose?.();
      await onChanged?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось удалить группу');
    }
  };

  const inviteMember = async () => {
    if (!group?.groupId) return;
    const username = inviteUsername.trim().replace(/^@/, '');
    if (!username) return;
    try {
      await inviteToGroup(group.groupId, { username });
      setInviteUsername('');
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось пригласить');
    }
  };

  const toggleAdmin = async (m) => {
    if (!group?.groupId || !m?.userId) return;
    if (!canOwner) return;
    const nextRole = m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    try {
      await setGroupMemberRole(group.groupId, m.userId, nextRole);
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось изменить роль');
    }
  };

  const removeMemberNow = async (m) => {
    if (!group?.groupId || !m?.userId) return;
    if (!canManage || m.role === 'OWNER') return;
    // eslint-disable-next-line no-alert
    const label = m?.user?.username ? `@${m.user.username}` : m?.user?.email || m.userId;
    const ok = window.confirm(`Удалить участника ${label} из группы?`);
    if (!ok) return;
    try {
      await removeGroupMember(group.groupId, m.userId);
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось удалить');
    }
  };

  const approveReq = async (r) => {
    if (!group?.groupId || !r?.userId) return;
    try {
      await approveGroupJoinRequest(group.groupId, r.userId);
      await loadRequests();
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось одобрить');
    }
  };

  const denyReq = async (r) => {
    if (!group?.groupId || !r?.userId) return;
    try {
      await denyGroupJoinRequest(group.groupId, r.userId);
      await loadRequests();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось отклонить');
    }
  };

  const inviteLink = `${appOrigin}/home?invite=${group?.inviteCode || ''}`;

  const copyInviteLink = async () => {
    const ok = await copyText(inviteLink);
    if (!ok) {
      // eslint-disable-next-line no-alert
      alert(inviteLink);
    }
  };

  const regenInvite = async () => {
    if (!group?.groupId) return;
    setRegeneratingInvite(true);
    try {
      await regenerateGroupInviteCode(group.groupId);
      await onChanged?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось перегенерировать');
    } finally {
      setRegeneratingInvite(false);
    }
  };

  if (!open || !group) return null;

  return (
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetTopRow}>
          <div className={styles.sheetTitleRowText}>Настройки группы</div>
          <button type="button" className={`${styles.groupActionBtn} tapTarget`} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className={styles.sheetSubTitle}>{group?.name || 'Группа'}</div>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tabBtn} ${tab === 'main' ? styles.tabBtnActive : ''}`} onClick={() => setTab('main')}>
            <Settings2 size={16} />
            Основные
          </button>
          <button type="button" className={`${styles.tabBtn} ${tab === 'members' ? styles.tabBtnActive : ''}`} onClick={() => setTab('members')} disabled={!canManage}>
            <Users size={16} />
            Участники
          </button>
          <button type="button" className={`${styles.tabBtn} ${tab === 'link' ? styles.tabBtnActive : ''}`} onClick={() => setTab('link')} disabled={!canManage}>
            <Link2 size={16} />
            Ссылка
          </button>
          <button type="button" className={`${styles.tabBtn} ${tab === 'requests' ? styles.tabBtnActive : ''}`} onClick={() => setTab('requests')} disabled={!canManage}>
            <Dot size={16} />
            Запросы
          </button>
        </div>

        {tab === 'main' ? (
          <div className={styles.gBody}>
            <div className={styles.gSectionTitle}>Название группы</div>
            <input className={styles.input} value={draftName} onChange={(e) => setDraftName(e.target.value)} disabled={!canManage} />
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btnPrimary} onClick={saveName} disabled={!canManage || saving || !draftName.trim()}>
                {saving ? <Loader2 size={16} className={styles.spinner} /> : null}
                Сохранить
              </button>
              <button type="button" className={styles.btnGhost} onClick={onClose}>
                Закрыть
              </button>
            </div>

            <div className={styles.gDivider} />
            <div className={styles.gSectionTitle}>Удалить группу</div>
            <div className={styles.gMuted}>
              Удаление группы приведет к удалению всех ее досок и потере информации о входящих в нее пользователях.
            </div>
            <button type="button" className={styles.btnDanger} onClick={deleteThisGroup} disabled={!canOwner}>
              Удалить группу
            </button>
          </div>
        ) : null}

        {tab === 'members' ? (
          <div className={styles.gBody}>
            <div className={styles.gRowTop}>
              <div className={styles.gSectionTitle}>Участники группы</div>
            </div>

            <div className={styles.searchMembers}>
              <Search size={16} className={styles.searchIcon} aria-hidden="true" />
              <input
                className={styles.search}
                placeholder="Поиск по username или email"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>

            <div className={styles.inviteRowMobile}>
              <input
                className={styles.input}
                placeholder="username (например: ivanov)"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
              />
              <button type="button" className={styles.btnGhost} onClick={inviteMember} disabled={!inviteUsername.trim()}>
                Пригласить
              </button>
            </div>

            {loadingMembers ? (
              <div className={styles.loadingState}>
                <Loader2 size={18} className={styles.spinner} />Загрузка…
              </div>
            ) : (
              <div className={styles.memberList}>
                {members
                  .filter((m) => {
                    const q = memberSearch.trim().toLowerCase();
                    if (!q) return true;
                    const u = m?.user || {};
                    return (
                      String(u?.username || '').toLowerCase().includes(q) ||
                      String(u?.email || '').toLowerCase().includes(q)
                    );
                  })
                  .map((m) => (
                    <div key={m.id} className={styles.memberRowMobile}>
                      <div className={styles.memberMain}>
                        <div className={styles.memberEmail}>
                          {m?.user?.username ? `@${m.user.username}` : m?.user?.email || `User #${m.userId}`}
                        </div>
                        {m?.user?.username && m?.user?.email ? (
                          <div className={styles.gMutedSmall}>{m.user.email}</div>
                        ) : null}
                        <div className={styles.gMutedSmall}>{m.role === 'OWNER' ? 'Владелец' : m.role === 'ADMIN' ? 'Админ' : 'Участник'}</div>
                      </div>
                      <div className={styles.memberActionsMobile}>
                        {canOwner && m.role !== 'OWNER' ? (
                          <button type="button" className={styles.smallBtn} onClick={() => toggleAdmin(m)}>
                            {m.role === 'ADMIN' ? 'Снять админа' : 'Сделать админом'}
                          </button>
                        ) : null}
                        {canManage && m.role !== 'OWNER' ? (
                          <button type="button" className={styles.smallBtnDanger} onClick={() => removeMemberNow(m)}>
                            Удалить
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'link' ? (
          <div className={styles.gBody}>
            <div className={styles.gSectionTitle}>Приглашение по ссылке</div>
            <div className={styles.gMuted}>Скопируйте ссылку и отправьте человеку, чтобы он мог присоединиться к группе.</div>
            <div className={styles.inviteLinkBox}>
              <input className={styles.input} readOnly value={inviteLink} />
              <button type="button" className={styles.btnGhost} onClick={copyInviteLink}>
                Скопировать
              </button>
            </div>
            <button type="button" className={styles.btnGhost} onClick={regenInvite} disabled={regeneratingInvite}>
              {regeneratingInvite ? <Loader2 size={16} className={styles.spinner} /> : null}
              Перегенерировать ссылку
            </button>
          </div>
        ) : null}

        {tab === 'requests' ? (
          <div className={styles.gBody}>
            <div className={styles.gSectionTitle}>Запросы на добавление в группу</div>
            <div className={styles.gMuted}>При добавлении в группу, пользователь получает все возможности участника группы.</div>
            {loadingRequests ? (
              <div className={styles.loadingState}>
                <Loader2 size={18} className={styles.spinner} />Загрузка…
              </div>
            ) : requests.length ? (
              <div className={styles.reqList}>
                {requests.map((r) => (
                  <div key={r.id} className={styles.reqRow}>
                    <div className={styles.reqEmail}>{r.user?.email || `User #${r.userId}`}</div>
                    <div className={styles.reqActions}>
                      <button type="button" className={styles.smallBtn} onClick={() => approveReq(r)}>
                        Одобрить
                      </button>
                      <button type="button" className={styles.smallBtnDanger} onClick={() => denyReq(r)}>
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyCenter}>Запросов нет</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BoardSettingsScreen({
  open,
  board,
  appOrigin,
  onClose,
  onReload,
  onOpenBoard,
}) {
  const [view, setView] = useState('menu'); // menu | rename | about
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setView('menu');
    setRenameValue(String(board?.name || ''));
    setBusy(false);
  }, [open, board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !board) return null;

  const link = board?.id ? `${appOrigin}/workspace/${board.id}` : '';
  const title = String(board?.name || 'Доска');

  const share = async () => {
    if (!link) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url: link });
        return;
      }
      const ok = await copyText(link);
      if (!ok) {
        // eslint-disable-next-line no-alert
        alert(link);
      }
    } catch {
      // ignore share errors
    }
  };

  const copyLink = async () => {
    if (!link) return;
    const ok = await copyText(link);
    if (!ok) {
      // eslint-disable-next-line no-alert
      alert(link);
    }
  };

  const doDuplicate = async () => {
    if (!board?.id) return;
    setBusy(true);
    try {
      const created = await duplicateWorkspace(board.id);
      await onReload?.();
      onClose?.();
      onOpenBoard?.(created?.id || created?.deskId || created?.workspaceId || board.id);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось дублировать доску');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!board?.id) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`Удалить доску "${board?.name || ''}"? Это действие нельзя отменить.`);
    if (!ok) return;
    setBusy(true);
    try {
      await deleteWorkspace(board.id);
      await onReload?.();
      onClose?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось удалить доску');
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!board?.id) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      await updateWorkspace(board.id, { name });
      await onReload?.();
      setView('menu');
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось переименовать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.fullOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.fullScreen} safeTopPad safeBottomPad`}
        role="dialog"
        aria-modal="true"
        aria-label="Настройки доски"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.fullHeader}>
          <button type="button" className={`${styles.fullHeaderBtn} tapTarget`} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
          <div className={styles.fullHeaderTitle}>Настройки</div>
          <div className={styles.fullHeaderSpacer} />
        </div>

        <div className={styles.fullSubTitle} title={title}>
          {title}
        </div>
        {board?.groupName ? <div className={styles.fullMeta}>Группа: {board.groupName}</div> : null}

        {view === 'menu' ? (
          <div className={styles.fullBody}>
            <div className={styles.fullActions}>
              <button type="button" className={styles.fullAction} onClick={() => onOpenBoard?.(board.id)}>
                <LayoutGrid size={18} />
                Открыть
              </button>
              <button type="button" className={styles.fullAction} onClick={share}>
                <Link2 size={18} />
                Поделиться
              </button>
              <button type="button" className={styles.fullAction} onClick={copyLink}>
                <Copy size={18} />
                Скопировать ссылку
              </button>
              <button
                type="button"
                className={styles.fullAction}
                onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}
                disabled={!link}
              >
                <ExternalLink size={18} />
                Открыть в новой вкладке
              </button>
              <div className={styles.fullDivider} />
              <button type="button" className={styles.fullAction} onClick={doDuplicate} disabled={busy}>
                <Dot size={18} />
                Дублировать
              </button>
              <button type="button" className={styles.fullAction} onClick={() => setView('rename')} disabled={busy}>
                <Pencil size={18} />
                Переименовать
              </button>
              <button type="button" className={styles.fullAction} onClick={() => setView('about')}>
                <Info size={18} />
                О доске
              </button>
              <div className={styles.fullDivider} />
              <button type="button" className={`${styles.fullAction} ${styles.fullDanger}`} onClick={doDelete} disabled={busy}>
                <Trash2 size={18} />
                Удалить
              </button>
            </div>
          </div>
        ) : null}

        {view === 'rename' ? (
          <div className={styles.fullBody}>
            <div className={styles.fullSectionTitle}>Переименовать</div>
            <input
              className={styles.input}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Название доски"
              autoFocus
            />
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setView('menu')} disabled={busy}>
                Отмена
              </button>
              <button type="button" className={styles.btnPrimary} onClick={saveRename} disabled={busy || !renameValue.trim()}>
                {busy ? <Loader2 size={16} className={styles.spinner} /> : <Pencil size={16} />}
                Сохранить
              </button>
            </div>
          </div>
        ) : null}

        {view === 'about' ? (
          <div className={styles.fullBody}>
            <div className={styles.fullSectionTitle}>О доске</div>
            <div className={styles.aboutKv}>
              <span>Название</span>
              <b>{board?.name || '—'}</b>
            </div>
            <div className={styles.aboutKv}>
              <span>ID</span>
              <b>{board?.id ?? '—'}</b>
            </div>
            <div className={styles.aboutKv}>
              <span>Группа</span>
              <b>{board?.groupName || '—'}</b>
            </div>
            {board?.updatedAt ? (
              <div className={styles.aboutKv}>
                <span>Изменена</span>
                <b>{String(board.updatedAt)}</b>
              </div>
            ) : null}
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setView('menu')}>
                Назад
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => onOpenBoard?.(board.id)}>
                Открыть
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MobileHomePage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => getToken());
  const [loading, setLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupDesks, setGroupDesks] = useState(new Map()); // groupId -> desks[]
  const [createMode, setCreateMode] = useState(null); // 'personal' | 'group' | null
  const [createGroupId, setCreateGroupId] = useState(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupSettingsId, setGroupSettingsId] = useState(null);
  const [boardSettings, setBoardSettings] = useState(null); // { id, name, groupName?, updatedAt? }
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardsQuery, setBoardsQuery] = useState('');
  const searchInputRef = useRef(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return { personal: false, groupBoards: false, groupIds: {} };
    }
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    const parsed = raw ? safeParseJson(raw) : null;
    const groupIds = parsed && typeof parsed.groupIds === 'object' && parsed.groupIds ? parsed.groupIds : {};
    return {
      personal: Boolean(parsed?.personal),
      groupBoards: Boolean(parsed?.groupBoards),
      groupIds,
    };
  });
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [upcoming, setUpcoming] = useState([]);
  const [activeUpcomingIdx, setActiveUpcomingIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const blockClickRef = useRef(0);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pointerId: null,
    swiped: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const onToken = () => setToken(getToken());
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    window.addEventListener('healis:token', onToken);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('healis:token', onToken);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setGroups([]);
      setGroupDesks(new Map());
      return;
    }
    setLoading(true);
    try {
      const [ws, gs] = await Promise.all([getAllWorkspaces(), getMyGroups()]);
      setWorkspaces(Array.isArray(ws) ? ws : []);
      setGroups(Array.isArray(gs) ? gs : []);

      const desksByGroup = new Map();
      await Promise.all(
        (Array.isArray(gs) ? gs : []).map(async (g) => {
          try {
            const data = await getGroupDesks(g.groupId);
            desksByGroup.set(g.groupId, Array.isArray(data?.desks) ? data.desks : []);
          } catch {
            desksByGroup.set(g.groupId, []);
          }
        })
      );
      setGroupDesks(desksByGroup);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const personal = useMemo(() => (Array.isArray(workspaces) ? workspaces : []), [workspaces]);
  const manageableGroups = useMemo(
    () => (Array.isArray(groups) ? groups.filter((g) => g?.myRole === 'OWNER' || g?.myRole === 'ADMIN') : []),
    [groups]
  );

  const appOrigin = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), []);
  const groupSettingsGroup = useMemo(() => (groupSettingsId ? groups.find((g) => Number(g.groupId) === Number(groupSettingsId)) : null), [groupSettingsId, groups]);
  const qNorm = useMemo(() => String(boardsQuery || '').trim().toLowerCase(), [boardsQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    // Let the input render first, then focus.
    const t = window.setTimeout(() => {
      try {
        searchInputRef.current?.focus?.();
      } catch {
        // ignore
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  const toggleSectionCollapsed = useCallback((key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleGroupCollapsed = useCallback((groupId) => {
    setCollapsed((prev) => ({
      ...prev,
      groupIds: {
        ...(prev.groupIds || {}),
        [groupId]: !prev?.groupIds?.[groupId],
      },
    }));
  }, []);

  const loadUpcoming = useCallback(async () => {
    if (!token) {
      setUpcoming([]);
      return;
    }
    setCalendarLoading(true);
    try {
      const now = new Date();
      const thisMonth = monthParam(now);
      const nextMonth = monthParam(new Date(now.getFullYear(), now.getMonth() + 1, 1));
      const [a, b] = await Promise.all([getMyCalendar({ month: thisMonth }), getMyCalendar({ month: nextMonth })]);

      const rows = [];
      for (const data of [a, b]) {
        const confirmed = Array.isArray(data?.confirmed) ? data.confirmed : [];
        for (const row of confirmed) rows.push(row?.event);
        const mine = Array.isArray(data?.myEvents) ? data.myEvents : [];
        for (const ev of mine) rows.push(ev);
      }

      const upcomingList = rows
        .filter(Boolean)
        .filter((ev) => {
          const d = new Date(ev?.startsAt);
          if (Number.isNaN(d.getTime())) return false;
          return d.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        })
        .sort((a, b) => String(a?.startsAt || '').localeCompare(String(b?.startsAt || '')))
        .slice(0, 12);

      setUpcoming(upcomingList);
    } catch {
      setUpcoming([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);

  useEffect(() => {
    setActiveUpcomingIdx((i) => {
      if (!upcoming.length) return 0;
      if (i < 0) return 0;
      if (i >= upcoming.length) return 0;
      return i;
    });
  }, [upcoming]);

  const activeEvent = upcoming[activeUpcomingIdx] || null;

  const onHeroPointerDown = (e) => {
    if (upcoming.length < 2) return;
    dragRef.current.active = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.swiped = false;
    setDragX(0);
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onHeroPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;

    // If user clearly scrolls vertically, bail out and let the page scroll.
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.35) {
      dragRef.current.active = false;
      setDragX(0);
      setDragging(false);
      return;
    }

    // clamp drag to keep UI stable
    const clamped = Math.max(-90, Math.min(90, dx));
    setDragX(clamped);
  };

  const onHeroPointerEnd = () => {
    if (!dragRef.current.active) {
      setDragX(0);
      setDragging(false);
      return;
    }
    const dx = dragRef.current.lastX - dragRef.current.startX;
    const threshold = 48;

    if (dx <= -threshold && activeUpcomingIdx < upcoming.length - 1) {
      dragRef.current.swiped = true;
      blockClickRef.current = Date.now() + 450;
      setActiveUpcomingIdx((i) => Math.min(i + 1, upcoming.length - 1));
    } else if (dx >= threshold && activeUpcomingIdx > 0) {
      dragRef.current.swiped = true;
      blockClickRef.current = Date.now() + 450;
      setActiveUpcomingIdx((i) => Math.max(i - 1, 0));
    }

    dragRef.current.active = false;
    setDragX(0);
    setDragging(false);
  };

  const matchesBoard = useCallback(
    (ws, extra = '') => {
      if (!qNorm) return true;
      const a = String(ws?.name || '').toLowerCase();
      const b = String(extra || '').toLowerCase();
      return a.includes(qNorm) || b.includes(qNorm);
    },
    [qNorm]
  );

  const filteredPersonal = useMemo(() => personal.filter((ws) => matchesBoard(ws)), [personal, matchesBoard]);
  const filteredGroupDesks = useMemo(() => {
    if (!qNorm) return groupDesks;
    const next = new Map();
    for (const g of Array.isArray(groups) ? groups : []) {
      const desks = groupDesks.get(g.groupId) || [];
      const filtered = desks.filter((ws) => matchesBoard(ws, g?.name || ''));
      next.set(g.groupId, filtered);
    }
    return next;
  }, [qNorm, groupDesks, groups, matchesBoard]);

  return (
    <MobileLayout
      title={
        searchOpen ? (
          <div className={styles.homeSearchBar} role="search" aria-label="Поиск по доскам">
            <Search size={18} className={styles.homeSearchIcon} aria-hidden="true" />
            <input
              ref={searchInputRef}
              className={styles.homeSearchInput}
              value={boardsQuery}
              onChange={(e) => setBoardsQuery(e.target.value)}
              placeholder="Поиск по всем доскам…"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearchOpen(false);
                }
              }}
            />
          </div>
        ) : null
      }
      leftSlot={<UserMenu variant="bare" iconClickMode="settings" />}
      rightSlot={
        searchOpen ? (
          <button
            type="button"
            className={`${styles.headerIconBtn} tapTarget`}
            onClick={() => setSearchOpen(false)}
            aria-label="Закрыть поиск"
            title="Закрыть поиск"
          >
            <X size={20} />
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.headerIconBtn} tapTarget`}
            onClick={() => setSearchOpen(true)}
            aria-label="Поиск по доскам"
            title="Поиск"
          >
            <Search size={20} />
          </button>
        )
      }
    >
      {!token ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Войдите, чтобы видеть доски</div>
          <div className={styles.emptySub}>После входа здесь появятся личные и групповые доски.</div>
          <button type="button" className={styles.btnPrimaryWide} onClick={() => navigate('/auth')}>
            Войти
          </button>
        </div>
      ) : loading ? (
        <div className={styles.loading}>Загрузка…</div>
      ) : (
        <>
          <section className={styles.eventsSection}>
            <div className={styles.eventsCard}>
              <div className={styles.eventsHeader}>
                <div className={styles.eventsTitle}>
                  <CalendarDays size={18} />
                  <span>Ближайшие события</span>
                </div>
                <button type="button" className={styles.eventsLink} onClick={() => navigate('/calendar')}>
                  Все
                </button>
              </div>

              {!token ? null : calendarLoading ? (
                <div className={styles.eventsState}>Загрузка…</div>
              ) : upcoming.length && activeEvent ? (
                <div
                  className={styles.heroWrap}
                  onPointerDown={onHeroPointerDown}
                  onPointerMove={onHeroPointerMove}
                  onPointerUp={onHeroPointerEnd}
                  onPointerCancel={onHeroPointerEnd}
                  role="group"
                  aria-label="Ближайшее событие"
                >
                  <button
                    type="button"
                    className={`${styles.heroCard} ${dragging ? styles.heroCardDragging : ''}`}
                    style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
                    onClick={() => {
                      if (Date.now() < blockClickRef.current) return;
                      navigate('/calendar');
                    }}
                  >
                    <div className={styles.heroTop}>
                      <span className={styles.heroIcon} aria-hidden="true">
                        {(() => {
                          const Icon = eventIconFor(activeEvent);
                          return <Icon size={18} />;
                        })()}
                      </span>
                      <div className={styles.heroTopMain}>
                        <div className={styles.heroBadges}>
                          <span className={styles.heroBadge}>{typeLabel(activeEvent?.type)}</span>
                        </div>
                        <div className={styles.heroWhen}>
                          <span className={styles.heroWhenWk}>{formatWeekday(activeEvent?.startsAt)}</span>
                          <span className={styles.heroWhenDt}>{formatDayMonth(activeEvent?.startsAt)}</span>
                          {!activeEvent?.allDay && formatTime(activeEvent?.startsAt) ? (
                            <span className={styles.heroWhenTime}>• {formatTime(activeEvent?.startsAt)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className={styles.heroTitle}>{activeEvent?.title || 'Событие'}</div>

                    <div className={styles.heroMeta}>
                      {activeEvent?.subject ? (
                        <div className={styles.heroMetaRow}>
                          <span className={styles.heroMetaLabel}>Предмет</span>
                          <span className={styles.heroMetaValue}>{activeEvent.subject}</span>
                        </div>
                      ) : null}
                    </div>

                    {upcoming.length > 1 ? (
                      <div className={styles.heroDots} aria-hidden="true">
                        {upcoming.map((_, i) => (
                          // eslint-disable-next-line react/no-array-index-key
                          <span key={i} className={`${styles.heroDot} ${i === activeUpcomingIdx ? styles.heroDotActive : ''}`} />
                        ))}
                      </div>
                    ) : null}
                  </button>
                </div>
              ) : (
                <div className={styles.eventsState}>Пока нет ближайших событий.</div>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <CollapseButton
                  collapsed={Boolean(collapsed.personal)}
                  onToggle={() => toggleSectionCollapsed('personal')}
                  label="личные доски"
                />
                <div className={styles.sectionTitle}>Личные доски</div>
              </div>
              <div className={styles.sectionHeaderActions}>
                <button
                  type="button"
                  className={`${styles.sectionAction} tapTarget`}
                  onClick={() => {
                    setCreateGroupId(null);
                    setCreateMode('personal');
                  }}
                  aria-label="Создать личную доску"
                  title="Создать личную доску"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            {collapsed.personal ? null : (
              <div className={styles.cardList}>
                {filteredPersonal.length ? (
                  filteredPersonal.map((ws) => (
                    <BoardRow
                      key={ws.id}
                      title={ws?.name || 'Без названия'}
                      onOpen={() => navigate(`/workspace/${ws.id}`)}
                      onOpenMenu={() =>
                        setBoardSettings({
                          id: ws.id,
                          name: ws?.name || 'Без названия',
                          updatedAt: ws?.updatedAt,
                          groupName: null,
                        })
                      }
                      icon={LayoutGrid}
                      tint="blue"
                    />
                  ))
                ) : (
                  <div className={styles.hint}>{qNorm ? 'Ничего не найдено.' : 'Пока нет личных досок.'}</div>
                )}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <CollapseButton
                  collapsed={Boolean(collapsed.groupBoards)}
                  onToggle={() => toggleSectionCollapsed('groupBoards')}
                  label="групповые доски"
                />
                <div className={styles.sectionTitle}>Групповые доски</div>
              </div>
              <div className={styles.sectionHeaderActions}>
                <button
                  type="button"
                  className={`${styles.sectionAction} tapTarget`}
                  onClick={() => setCreateGroupOpen(true)}
                  aria-label="Создать группу"
                  title="Создать группу"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            {collapsed.groupBoards ? null : (
              <div className={styles.groupList}>
                {groups.length ? (
                  groups.map((g) => {
                    const desks = filteredGroupDesks.get(g.groupId) || [];
                    const groupCollapsed = Boolean(collapsed?.groupIds?.[g.groupId]);
                    const canManage = g?.myRole === 'OWNER' || g?.myRole === 'ADMIN';
                    if (qNorm && !desks.length) return null;
                    return (
                      <div key={g.groupId} className={styles.groupBlock}>
                        <div className={styles.groupHeader}>
                          <CollapseButton
                            collapsed={groupCollapsed}
                            onToggle={() => toggleGroupCollapsed(g.groupId)}
                            label={`доски группы ${g?.name || ''}`.trim()}
                          />
                          <div className={styles.groupHeaderMain}>
                            <div className={styles.groupName}>{g?.name || 'Группа'}</div>
                          </div>
                          {canManage ? (
                            <div className={styles.groupHeaderActions}>
                              <button
                                type="button"
                                className={`${styles.groupActionBtn} tapTarget`}
                                onClick={() => setGroupSettingsId(g.groupId)}
                                aria-label="Настройки группы"
                                title="Настройки группы"
                              >
                                <Settings2 size={18} />
                              </button>
                              <button
                                type="button"
                                className={`${styles.groupActionBtn} tapTarget`}
                                onClick={() => {
                                  setCreateGroupId(g.groupId);
                                  setCreateMode('group');
                                }}
                                aria-label="Создать доску в группе"
                                title="Создать доску в группе"
                              >
                                <Plus size={18} />
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {groupCollapsed ? null : (
                          <div className={styles.cardList}>
                            {desks.length ? (
                              desks.map((ws) => (
                                <BoardRow
                                  key={`g-${g.groupId}-${ws.id}`}
                                  title={ws?.name || 'Без названия'}
                                  onOpen={() => navigate(`/workspace/${ws.id}`)}
                                  onOpenMenu={() =>
                                    setBoardSettings({
                                      id: ws.id,
                                      name: ws?.name || 'Без названия',
                                      updatedAt: ws?.updatedAt,
                                      groupName: g?.name || null,
                                    })
                                  }
                                  icon={Users}
                                  tint="violet"
                                />
                              ))
                            ) : (
                              <div className={styles.hint}>Пока нет досок в этой группе.</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.hint}>{qNorm ? 'Ничего не найдено.' : 'Пока нет групповых досок.'}</div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <CreateBoardSheet
        open={Boolean(createMode)}
        mode={createMode || 'personal'}
        groups={createMode === 'group' ? manageableGroups : []}
        fixedGroupId={createMode === 'group' ? createGroupId : null}
        onClose={() => {
          setCreateMode(null);
          setCreateGroupId(null);
        }}
        onCreated={() => {
          load();
          loadUpcoming();
        }}
      />

      <CreateGroupSheet
        open={Boolean(createGroupOpen)}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={() => {
          load();
        }}
      />

      <GroupSettingsSheet
        open={Boolean(groupSettingsId)}
        group={groupSettingsGroup}
        appOrigin={appOrigin}
        onClose={() => setGroupSettingsId(null)}
        onChanged={() => load()}
      />

      <BoardSettingsScreen
        open={Boolean(boardSettings?.id)}
        board={boardSettings}
        appOrigin={appOrigin}
        onClose={() => setBoardSettings(null)}
        onReload={() => load()}
        onOpenBoard={(id) => navigate(`/workspace/${id}`)}
      />
    </MobileLayout>
  );
}


