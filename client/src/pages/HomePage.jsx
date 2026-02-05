import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  Copy,
  Dot,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
  LayoutGrid,
  X,
} from 'lucide-react';
import {
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  getAllWorkspaces,
  getFavoriteWorkspaces,
  getRecentWorkspaces,
  toggleFavoriteWorkspace,
  updateWorkspace,
} from '../http/workspaceAPI';
import { createProject, getMyProjects } from '../http/projectAPI';
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
  joinGroupByCode,
} from '../http/groupAPI';
import { getToken } from '../http/userAPI';
import UserMenu from '../components/UserMenu';
import styles from '../styles/HomePage.module.css';
import noteImg from '../static/note.png';

function safeParseJwt(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function formatChangedLabel(updatedAt) {
  const d = updatedAt ? new Date(updatedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
  if (sameDay) return `Сегодня, ${time}`;
  const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  return `${date}, ${time}`;
}

function formatOpenedLabel(openedAt) {
  const d = openedAt ? new Date(openedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
  if (sameDay) return `Сегодня, ${time}`;
  const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  return `${date}, ${time}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return true;
  } catch {
    return false;
  }
}

function NavItem({ active, icon: Icon, children, onClick, badge }) {
  return (
    <button
      type="button"
      className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
      onClick={onClick}
    >
      <span className={styles.navIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className={styles.navText}>{children}</span>
      {badge ? <span className={styles.navBadge}>{badge}</span> : null}
    </button>
  );
}

function CreateBoardModal({ isOpen, onClose, onCreate, loading, title, submitLabel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{title}</div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <form className={styles.modalForm} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Название *</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Стратегия - Life"
              autoFocus
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Описание (опционально)</span>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Короткое описание…"
            />
          </label>

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={loading || !name.trim()}>
              {loading ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BoardCard({
  board,
  ownerLabel,
  changedLabel,
  openedLabel,
  isFavorite,
  onToggleFavorite,
  onOpen,
  onOpenMenu,
}) {
  return (
    <div
      className={styles.boardCard}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
    >
      <div className={styles.cardTop}>
        <div className={styles.boardTitle}>{board?.name || 'Без названия'}</div>
        <button
          type="button"
          className={styles.dotsBtn}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu?.(e);
          }}
          aria-label="Меню доски"
          title="Меню"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className={styles.previewArea} aria-hidden="true">
        <button
          type="button"
          className={`${styles.starBtn} ${isFavorite ? styles.starBtnActive : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.();
          }}
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          title={isFavorite ? 'Убрать из избранного' : 'В избранное'}
        >
          <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <div className={styles.previewArt}>
          <img src={noteImg} alt="" />
        </div>
      </div>

      <div className={styles.metaList}>
        <div className={styles.boardMeta}>Владелец: {ownerLabel}</div>
        <div className={styles.boardMeta}>Изменена: {changedLabel}</div>
        {openedLabel ? <div className={styles.boardMeta}>Открыта: {openedLabel}</div> : null}
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => getToken());
  const user = useMemo(() => (token ? safeParseJwt(token) : null), [token]);
  const myUserId = user?.id ?? null;
  const myName = user?.nickname || (user?.username ? `@${user.username}` : '') || user?.email || 'Вы';

  const [activeTab, setActiveTab] = useState('recent'); // 'recent' | 'favorites' | 'group'
  const [chip, setChip] = useState('all'); // 'all' | 'mine' | 'other'
  const [query, setQuery] = useState('');

  const [workspaces, setWorkspaces] = useState([]);
  const [recent, setRecent] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [projects, setProjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupDesks, setGroupDesks] = useState({}); // groupId -> { desks, canManage, myRole }
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState('');

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');

  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupSettingsTab, setGroupSettingsTab] = useState('main'); // main|members|permissions|invites
  const [groupMembers, setGroupMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [groupRequests, setGroupRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState('');
  const [regeneratingInviteCode, setRegeneratingInviteCode] = useState(false);

  const [menuDesk, setMenuDesk] = useState(null); // board object
  const [menuPos, setMenuPos] = useState(null); // {x,y}
  const [shareLink, setShareLink] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null); // board
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [aboutTarget, setAboutTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    const onToken = () => setToken(getToken());
    window.addEventListener('storage', onStorage);
    window.addEventListener('healis:token', onToken);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('healis:token', onToken);
    };
  }, []);

  // Accept invite link (origin/home?invite=CODE) -> join group by code.
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    const code = String(url.searchParams.get('invite') || '').trim();
    if (!code) return;
    (async () => {
      try {
        await joinGroupByCode(code);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
      } catch {
        // ignore
      }
    })();
  }, [token]);

  const loadAll = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setRecent([]);
      setFavorites([]);
      setProjects([]);
      setGroups([]);
      setGroupDesks({});
      setSelectedGroupId(null);
      return;
    }
    setLoading(true);
    try {
      const [ws, gs, rec, fav, proj] = await Promise.all([
        getAllWorkspaces(),
        getMyGroups(),
        getRecentWorkspaces(),
        getFavoriteWorkspaces(),
        getMyProjects(),
      ]);
      setWorkspaces(Array.isArray(ws) ? ws : []);
      setGroups(Array.isArray(gs) ? gs : []);
      setRecent(Array.isArray(rec) ? rec : []);
      setFavorites(Array.isArray(fav) ? fav : []);
      setProjects(Array.isArray(proj) ? proj : []);
      const groupList = Array.isArray(gs) ? gs : [];
      if (!selectedGroupId && groupList.length) setSelectedGroupId(groupList[0].groupId);

      const results = await Promise.all(
        groupList.map(async (g) => {
          try {
            const payload = await getGroupDesks(g.groupId);
            return [g.groupId, payload];
          } catch {
            return [g.groupId, { desks: [], canManage: false, myRole: g.myRole }];
          }
        })
      );
      const map = {};
      for (const [gid, payload] of results) map[gid] = payload;
      setGroupDesks(map);
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.groupId === selectedGroupId) || null,
    [groups, selectedGroupId]
  );
  const selectedGroupPayload = selectedGroupId ? groupDesks[selectedGroupId] : null;
  const canManageSelectedGroup = Boolean(selectedGroupPayload?.canManage);

  const allBoards = useMemo(() => {
    const personal = (Array.isArray(workspaces) ? workspaces : []).map((w) => ({ ...w, groupId: null, group: null }));
    const groupBoards = [];
    for (const g of Array.isArray(groups) ? groups : []) {
      const desks = groupDesks[g.groupId]?.desks || [];
      for (const d of desks) groupBoards.push({ ...d, groupId: g.groupId, group: { groupId: g.groupId, name: g.name } });
    }
    return personal.concat(groupBoards);
  }, [groupDesks, groups, workspaces]);

  const groupBoardsSelected = useMemo(() => {
    const desks = selectedGroupId ? groupDesks[selectedGroupId]?.desks || [] : [];
    const g = selectedGroup ? { groupId: selectedGroup.groupId, name: selectedGroup.name } : null;
    return desks.map((d) => ({ ...d, groupId: selectedGroupId, group: g }));
  }, [groupDesks, selectedGroup, selectedGroupId]);

  const baseList = useMemo(() => {
    if (activeTab === 'favorites') return favorites;
    if (activeTab === 'group') return groupBoardsSelected;
    // recent
    if (Array.isArray(recent) && recent.length) return recent;
    // fallback for a brand new user: show all boards sorted by update time
    return [...allBoards].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [activeTab, allBoards, favorites, groupBoardsSelected, recent]);

  const searchedList = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return baseList;
    return allBoards.filter((b) => String(b?.name || '').toLowerCase().includes(q));
  }, [allBoards, baseList, query]);

  const filteredList = useMemo(() => {
    if (!myUserId) return searchedList;
    if (chip === 'mine') return searchedList.filter((b) => Number(b.userId) === Number(myUserId));
    if (chip === 'other') return searchedList.filter((b) => Number(b.userId) !== Number(myUserId));
    return searchedList;
  }, [chip, myUserId, searchedList]);

  const title = activeTab === 'recent' ? 'Последние доски' : activeTab === 'favorites' ? 'Избранные доски' : 'Доски в этой группе';

  const openBoard = (b) => navigate(`/workspace/${b.id}`);

  const favoritesSet = useMemo(() => new Set(favorites.map((f) => Number(f.id))), [favorites]);
  const appOrigin = useMemo(() => window.location.origin, []);
  const recentOpenedAtById = useMemo(() => {
    const m = new Map();
    for (const r of Array.isArray(recent) ? recent : []) {
      if (r?.id != null && r?.lastOpenedAt) m.set(Number(r.id), r.lastOpenedAt);
    }
    return m;
  }, [recent]);

  const boardLink = (b) => `${appOrigin}/workspace/${b.id}`;

  const openMenuFor = (b, e) => {
    const x = e?.clientX ?? 0;
    const y = e?.clientY ?? 0;
    setMenuDesk(b);
    setMenuPos({ x, y });
  };

  useEffect(() => {
    const onDown = () => {
      setMenuDesk(null);
      setMenuPos(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuDesk(null);
        setMenuPos(null);
        setShareLink(null);
        setAboutTarget(null);
        setMoveTarget(null);
        setRenameTarget(null);
        setGroupSettingsOpen(false);
        setShowCreateGroup(false);
        setShowCreateProject(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggleFav = async (b) => {
    if (!b?.id) return;
    try {
      await toggleFavoriteWorkspace(b.id);
      const fav = await getFavoriteWorkspaces();
      setFavorites(Array.isArray(fav) ? fav : []);
    } catch {
      // ignore
    }
  };

  const createBoard = async ({ name, description }) => {
    setCreating(true);
    try {
      const shouldCreateInGroup = activeTab === 'group' && selectedGroupId && canManageSelectedGroup;
      const newWs = shouldCreateInGroup
        ? await createGroupDesk(selectedGroupId, { name, description })
        : await createWorkspace({ name, description });
      setShowCreateModal(false);
      navigate(`/workspace/${newWs.id}`);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || 'Не удалось создать доску');
    } finally {
      setCreating(false);
    }
  };

  const doDuplicate = async (b) => {
    if (!b?.id) return;
    setMenuDesk(null);
    setMenuPos(null);
    try {
      const created = await duplicateWorkspace(b.id);
      await loadAll();
      navigate(`/workspace/${created.id}`);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || 'Не удалось дублировать доску');
    }
  };

  const doDelete = async (b) => {
    if (!b?.id) return;
    const ok = window.confirm(`Удалить доску "${b.name}"? Это действие нельзя отменить.`);
    if (!ok) return;
    setDeleting(true);
    setMenuDesk(null);
    setMenuPos(null);
    try {
      await deleteWorkspace(b.id);
      await loadAll();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || 'Не удалось удалить доску');
    } finally {
      setDeleting(false);
    }
  };

  const openRename = (b) => {
    setMenuDesk(null);
    setMenuPos(null);
    setRenameTarget(b);
    setRenameValue(String(b?.name || ''));
  };

  const submitRename = async (e) => {
    e.preventDefault();
    if (!renameTarget?.id) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      await updateWorkspace(renameTarget.id, { name });
      await loadAll();
      setRenameTarget(null);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось переименовать');
    } finally {
      setRenaming(false);
    }
  };

  const openMove = (b) => {
    setMenuDesk(null);
    setMenuPos(null);
    setMoveTarget(b);
  };

  const moveToProject = async (projectId) => {
    if (!moveTarget?.id) return;
    setMoving(true);
    try {
      await updateWorkspace(moveTarget.id, { projectId: projectId ?? null });
      await loadAll();
      setMoveTarget(null);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || 'Не удалось переместить');
    } finally {
      setMoving(false);
    }
  };

  const openShare = async (b) => {
    setMenuDesk(null);
    setMenuPos(null);
    const link = boardLink(b);
    setShareLink(link);
  };

  const openAbout = (b) => {
    setMenuDesk(null);
    setMenuPos(null);
    setAboutTarget(b);
  };

  const copyBoardLink = async (b) => {
    setMenuDesk(null);
    setMenuPos(null);
    const ok = await copyText(boardLink(b));
    if (!ok) alert(boardLink(b));
  };

  const copyAppLink = async () => {
    const ok = await copyText(appOrigin);
    if (!ok) alert(appOrigin);
  };

  const submitCreateProject = async (e) => {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    setCreatingProject(true);
    try {
      await createProject({ name });
      const proj = await getMyProjects();
      setProjects(Array.isArray(proj) ? proj : []);
      setProjectName('');
      setShowCreateProject(false);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось создать проект');
    } finally {
      setCreatingProject(false);
    }
  };

  const submitCreateGroup = async (e) => {
    e.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const g = await createGroup({ name });
      await loadAll();
      setSelectedGroupId(g?.groupId || null);
      setGroupName('');
      setShowCreateGroup(false);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось создать группу');
    } finally {
      setCreatingGroup(false);
    }
  };

  const openGroupSettings = async () => {
    if (!selectedGroup) return;
    setGroupSettingsTab('main');
    setDraftGroupName(selectedGroup?.name || '');
    setGroupSettingsOpen(true);
    // Load members/requests on demand
  };

  const loadMembers = useCallback(async () => {
    if (!selectedGroupId) return;
    setLoadingMembers(true);
    try {
      const rows = await getGroupMembers(selectedGroupId);
      setGroupMembers(Array.isArray(rows) ? rows : []);
    } catch {
      setGroupMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [selectedGroupId]);

  const loadRequests = useCallback(async () => {
    if (!selectedGroupId) return;
    setLoadingRequests(true);
    try {
      const rows = await getGroupJoinRequests(selectedGroupId);
      setGroupRequests(Array.isArray(rows) ? rows : []);
    } catch {
      setGroupRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (!groupSettingsOpen) return;
    if (groupSettingsTab === 'members') loadMembers();
    if (groupSettingsTab === 'invites') loadRequests();
  }, [groupSettingsOpen, groupSettingsTab, loadMembers, loadRequests]);

  const saveGroupName = async () => {
    if (!selectedGroupId) return;
    const name = draftGroupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      await updateGroup(selectedGroupId, { name });
      await loadAll();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingGroup(false);
    }
  };

  const deleteSelectedGroup = async () => {
    if (!selectedGroupId || !selectedGroup) return;
    const ok = window.confirm(`Удалить группу "${selectedGroup.name}"? Это удалит все доски группы.`);
    if (!ok) return;
    try {
      await deleteGroup(selectedGroupId);
      await loadAll();
      setGroupSettingsOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось удалить группу');
    }
  };

  const inviteMember = async () => {
    const username = inviteUsername.trim().replace(/^@/, '');
    if (!selectedGroupId || !username) return;
    try {
      await inviteToGroup(selectedGroupId, { username });
      setInviteUsername('');
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось пригласить');
    }
  };

  const toggleAdmin = async (m) => {
    if (!selectedGroupId || !m?.userId) return;
    const nextRole = m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    try {
      await setGroupMemberRole(selectedGroupId, m.userId, nextRole);
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось изменить роль');
    }
  };

  const removeMember = async (m) => {
    if (!selectedGroupId || !m?.userId) return;
    const label = m?.user?.username ? `@${m.user.username}` : m?.user?.email || m.userId;
    const ok = window.confirm(`Удалить участника ${label} из группы?`);
    if (!ok) return;
    try {
      await removeGroupMember(selectedGroupId, m.userId);
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось удалить');
    }
  };

  const approveReq = async (r) => {
    if (!selectedGroupId || !r?.userId) return;
    try {
      await approveGroupJoinRequest(selectedGroupId, r.userId);
      await loadRequests();
      await loadMembers();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось одобрить');
    }
  };

  const denyReq = async (r) => {
    if (!selectedGroupId || !r?.userId) return;
    try {
      await denyGroupJoinRequest(selectedGroupId, r.userId);
      await loadRequests();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось отклонить');
    }
  };

  const regenInviteCode = async () => {
    if (!selectedGroupId) return;
    setRegeneratingInviteCode(true);
    try {
      await regenerateGroupInviteCode(selectedGroupId);
      await loadAll();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось перегенерировать');
    } finally {
      setRegeneratingInviteCode(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true">
            H
          </div>
          <div className={styles.brandName}>Healis</div>
        </div>

        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
          />
        </div>

        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.btnInvite}
            onClick={copyAppLink}
          >
            Пригласить
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Уведомления" title="Уведомления">
            <Bell size={18} />
          </button>
          <UserMenu variant="compact" />
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav} aria-label="Главное меню">
            <NavItem active={activeTab === 'recent'} icon={LayoutGrid} onClick={() => setActiveTab('recent')}>
              Последние доски
            </NavItem>
            <NavItem active={activeTab === 'favorites'} icon={Star} onClick={() => setActiveTab('favorites')}>
              Избранные доски
            </NavItem>
            <NavItem
              active={false}
              icon={CalendarDays}
              onClick={() => navigate('/calendar')}
            >
              Календарь
            </NavItem>
          </nav>

          <div className={styles.sideSection}>
            <div className={styles.sideHeader}>
              <div className={styles.sideTitle}>Группы</div>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Создать группу"
                title="Создать группу"
                onClick={() => setShowCreateGroup(true)}
              >
                <Plus size={18} />
              </button>
            </div>

            <div className={styles.groupRow}>
              <select
                className={styles.select}
                value={selectedGroupId || ''}
                onChange={(e) => setSelectedGroupId(Number(e.target.value) || null)}
                disabled={!groups.length}
                aria-label="Выбор группы"
              >
                {groups.length ? null : <option value="">Нет групп</option>}
                {groups.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.name}
                  </option>
                ))}
              </select>
              {canManageSelectedGroup ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Настройки группы"
                  title="Настройки группы"
                  onClick={openGroupSettings}
                >
                  <Settings2 size={18} />
                </button>
              ) : (
                <button type="button" className={styles.iconBtn} disabled aria-label="Настройки группы недоступны">
                  <Settings2 size={18} />
                </button>
              )}
            </div>

            <button type="button" className={styles.linkRow} onClick={() => setActiveTab('group')}>
              Доски в этой группе
            </button>
          </div>

          <div className={styles.sideSection}>
            <div className={styles.sideHeader}>
              <div className={styles.sideTitle}>Проекты</div>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Создать проект"
                title="Создать проект"
                onClick={() => setShowCreateProject(true)}
              >
                <Plus size={18} />
              </button>
            </div>
            {projects.length ? (
              <div className={styles.projectList}>
                {projects.map((p) => (
                  <div key={p.projectId} className={styles.projectItem}>
                    {p.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyHint}>Создайте первый проект</div>
            )}
          </div>
        </aside>

        <main className={styles.content}>
          <div className={styles.contentTop}>
            <div className={styles.contentTitle}>{title}</div>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => (token ? setShowCreateModal(true) : navigate('/auth'))}
            >
              Создать доску
            </button>
          </div>

          <div className={styles.filtersRow}>
            <div className={styles.chips}>
              <button
                type="button"
                className={`${styles.chip} ${chip === 'all' ? styles.chipActive : ''}`}
                onClick={() => setChip('all')}
              >
                Все
              </button>
              <button
                type="button"
                className={`${styles.chip} ${chip === 'mine' ? styles.chipActive : ''}`}
                onClick={() => setChip('mine')}
              >
                Мои
              </button>
              <button
                type="button"
                className={`${styles.chip} ${chip === 'other' ? styles.chipActive : ''}`}
                onClick={() => setChip('other')}
              >
                Другие
              </button>
            </div>
          </div>

          {!token ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Войдите, чтобы видеть доски</div>
              <div className={styles.emptySub}>После входа здесь появятся последние и групповые доски.</div>
              <div style={{ marginTop: 12 }}>
                <button type="button" className={styles.btnPrimary} onClick={() => navigate('/auth')}>
                  Перейти к входу
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={22} className={styles.spinner} />
              <span>Загрузка...</span>
            </div>
          ) : activeTab === 'group' && !groups.length ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>У вас пока нет групп</div>
              <div className={styles.emptySub}>Создайте группу, чтобы разделять доски и приглашать участников.</div>
              <div style={{ marginTop: 12 }}>
                <button type="button" className={styles.btnPrimary} onClick={() => setShowCreateGroup(true)}>
                  Создать группу
                </button>
              </div>
            </div>
          ) : activeTab === 'group' && !selectedGroupId ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Выберите группу</div>
              <div className={styles.emptySub}>Выберите группу слева, чтобы увидеть доски.</div>
            </div>
          ) : !filteredList.length ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>
                {activeTab === 'favorites' ? 'В избранном пока пусто' : 'Доски не найдены'}
              </div>
              <div className={styles.emptySub}>
                {activeTab === 'favorites'
                  ? 'Нажмите на звезду на карточке, чтобы добавить доску.'
                  : 'Попробуйте изменить фильтр или строку поиска.'}
              </div>
            </div>
          ) : (
            <div className={styles.boardGrid}>
              {filteredList.map((b) => {
                const owner =
                  myUserId && Number(b.userId) === Number(myUserId)
                    ? myName
                    : b.group?.name
                      ? `Участник группы`
                      : `Пользователь #${b.userId}`;
                return (
                  <BoardCard
                    key={`${b.groupId || 'p'}-${b.id}`}
                    board={b}
                    ownerLabel={owner}
                    changedLabel={formatChangedLabel(b.updatedAt)}
                    openedLabel={formatOpenedLabel(b.lastOpenedAt || recentOpenedAtById.get(Number(b.id)))}
                    isFavorite={favoritesSet.has(Number(b.id))}
                    onToggleFavorite={() => toggleFav(b)}
                    onOpen={() => openBoard(b)}
                    onOpenMenu={(e) => openMenuFor(b, e)}
                  />
                );
              })}
            </div>
          )}
        </main>
      </div>

      <CreateBoardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={createBoard}
        loading={creating}
        title={activeTab === 'group' && selectedGroupId ? 'Создать доску в группе' : 'Создать доску'}
        submitLabel="Создать"
      />

      {menuDesk && menuPos ? (
        <div
          className={styles.dropdown}
          style={{ top: menuPos.y + 8, left: menuPos.x - 6 }}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className={styles.ddItem} onClick={() => openShare(menuDesk)}>
            <Link2 size={18} />
            Поделиться
          </button>
          <button type="button" className={styles.ddItem} onClick={() => copyBoardLink(menuDesk)}>
            <Copy size={18} />
            Скопировать ссылку
          </button>
          <button type="button" className={styles.ddItem} onClick={() => doDuplicate(menuDesk)}>
            <Dot size={18} />
            Дублировать
          </button>
          <div className={styles.ddDivider} />
          <button type="button" className={styles.ddItem} onClick={() => openRename(menuDesk)}>
            <Pencil size={18} />
            Переименовать
          </button>
          <button type="button" className={styles.ddItem} onClick={() => openAbout(menuDesk)}>
            <Info size={18} />
            О доске
          </button>
          <button
            type="button"
            className={styles.ddItem}
            onClick={() => window.open(boardLink(menuDesk), '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink size={18} />
            Открыть в новой вкладке
          </button>
          <div className={styles.ddDivider} />
          <button type="button" className={styles.ddItem} onClick={() => openMove(menuDesk)}>
            <Dot size={18} />
            Переместить в проект
          </button>
          <button type="button" className={`${styles.ddItem} ${styles.ddDanger}`} onClick={() => doDelete(menuDesk)} disabled={deleting}>
            <Trash2 size={18} />
            Удалить
          </button>
        </div>
      ) : null}

      {shareLink ? (
        <div className={styles.modalOverlay} onClick={() => setShareLink(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Поделиться</div>
              <button type="button" className={styles.iconBtn} onClick={() => setShareLink(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Ссылка</span>
                <input className={styles.input} value={shareLink} readOnly />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setShareLink(null)}>
                  Закрыть
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={async () => {
                    const ok = await copyText(shareLink);
                    if (!ok) alert(shareLink);
                  }}
                >
                  <Copy size={16} />
                  Скопировать
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {renameTarget ? (
        <div className={styles.modalOverlay} onClick={() => setRenameTarget(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Переименовать</div>
              <button type="button" className={styles.iconBtn} onClick={() => setRenameTarget(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <form className={styles.modalForm} onSubmit={submitRename}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Название</span>
                <input className={styles.input} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setRenameTarget(null)}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={renaming || !renameValue.trim()}>
                  {renaming ? <Loader2 size={16} className={styles.spinner} /> : <Pencil size={16} />}
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {aboutTarget ? (
        <div className={styles.modalOverlay} onClick={() => setAboutTarget(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>О доске</div>
              <button type="button" className={styles.iconBtn} onClick={() => setAboutTarget(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.kv}><span>Название</span><b>{aboutTarget?.name || '—'}</b></div>
              <div className={styles.kv}><span>ID</span><b>{aboutTarget?.id}</b></div>
              <div className={styles.kv}><span>Группа</span><b>{aboutTarget?.group?.name || '—'}</b></div>
              <div className={styles.kv}><span>Проект</span><b>{aboutTarget?.project?.name || '—'}</b></div>
              <div className={styles.kv}><span>Изменена</span><b>{formatChangedLabel(aboutTarget?.updatedAt)}</b></div>
              {aboutTarget?.lastOpenedAt ? (
                <div className={styles.kv}><span>Открывали</span><b>{formatOpenedLabel(aboutTarget?.lastOpenedAt)}</b></div>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnPrimary} onClick={() => openBoard(aboutTarget)}>
                  Открыть
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {moveTarget ? (
        <div className={styles.modalOverlay} onClick={() => setMoveTarget(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Переместить в проект</div>
              <button type="button" className={styles.iconBtn} onClick={() => setMoveTarget(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Выберите проект</span>
                <div className={styles.projectPick}>
                  <button type="button" className={styles.pickItem} disabled={moving} onClick={() => moveToProject(null)}>
                    Без проекта
                  </button>
                  {projects.map((p) => (
                    <button
                      key={p.projectId}
                      type="button"
                      className={styles.pickItem}
                      disabled={moving}
                      onClick={() => moveToProject(p.projectId)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setMoveTarget(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateProject ? (
        <div className={styles.modalOverlay} onClick={() => setShowCreateProject(false)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Создать проект</div>
              <button type="button" className={styles.iconBtn} onClick={() => setShowCreateProject(false)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <form className={styles.modalForm} onSubmit={submitCreateProject}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Название проекта</span>
                <input className={styles.input} value={projectName} onChange={(e) => setProjectName(e.target.value)} autoFocus />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setShowCreateProject(false)}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={creatingProject || !projectName.trim()}>
                  {creatingProject ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
                  Создать проект
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showCreateGroup ? (
        <div className={styles.modalOverlay} onClick={() => setShowCreateGroup(false)} role="presentation">
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeaderWide}>
              <div className={styles.modalTitle}>Название группы</div>
              <button type="button" className={styles.iconBtn} onClick={() => setShowCreateGroup(false)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <form className={styles.modalWideBody} onSubmit={submitCreateGroup}>
              <input
                className={styles.wideInput}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Новая группа"
                autoFocus
              />
              <div className={styles.wideHint}>
                Группа — это workspace. Создавайте группы, чтобы полностью разделить доски друг от друга.
              </div>
              <div className={styles.wideActions}>
                <button type="submit" className={styles.btnPrimary} disabled={creatingGroup || !groupName.trim()}>
                  {creatingGroup ? <Loader2 size={16} className={styles.spinner} /> : null}
                  Создать группу
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setShowCreateGroup(false)}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {groupSettingsOpen && selectedGroup ? (
        <div className={styles.modalOverlay} onClick={() => setGroupSettingsOpen(false)} role="presentation">
          <div className={styles.groupModal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.groupModalLeft}>
              <button type="button" className={`${styles.gTab} ${groupSettingsTab === 'main' ? styles.gTabActive : ''}`} onClick={() => setGroupSettingsTab('main')}>
                <Settings2 size={18} />
                Основные
              </button>
              <button type="button" className={`${styles.gTab} ${groupSettingsTab === 'members' ? styles.gTabActive : ''}`} onClick={() => setGroupSettingsTab('members')}>
                <Dot size={18} />
                Участники
              </button>
              <button type="button" className={`${styles.gTab} ${groupSettingsTab === 'permissions' ? styles.gTabActive : ''}`} onClick={() => setGroupSettingsTab('permissions')}>
                <Dot size={18} />
                Разрешения
              </button>
              <button type="button" className={`${styles.gTab} ${groupSettingsTab === 'invites' ? styles.gTabActive : ''}`} onClick={() => setGroupSettingsTab('invites')}>
                <Dot size={18} />
                Приглашения
              </button>
            </div>
            <div className={styles.groupModalRight}>
              <div className={styles.groupModalTop}>
                <div className={styles.groupModalTitle}>{selectedGroup.name}</div>
                <button type="button" className={styles.iconBtn} onClick={() => setGroupSettingsOpen(false)} aria-label="Закрыть">
                  <X size={18} />
                </button>
              </div>

              {groupSettingsTab === 'main' ? (
                <div className={styles.gBody}>
                  <div className={styles.gSectionTitle}>Название группы</div>
                  <input className={styles.input} value={draftGroupName} onChange={(e) => setDraftGroupName(e.target.value)} />
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.btnPrimary} onClick={saveGroupName} disabled={savingGroup || !draftGroupName.trim()}>
                      {savingGroup ? <Loader2 size={16} className={styles.spinner} /> : null}
                      Сохранить
                    </button>
                  </div>

                  <div className={styles.gDivider} />
                  <div className={styles.gSectionTitle}>Удалить группу</div>
                  <div className={styles.gMuted}>
                    Удаление группы приведет к удалению всех ее досок и потере информации о входящих в нее пользователях.
                  </div>
                  <button type="button" className={styles.btnDanger} onClick={deleteSelectedGroup} disabled={selectedGroup.myRole !== 'OWNER'}>
                    Удалить группу
                  </button>
                </div>
              ) : null}

              {groupSettingsTab === 'members' ? (
                <div className={styles.gBody}>
                  <div className={styles.gRowTop}>
                    <div className={styles.gSectionTitle}>Участники группы</div>
                    <button type="button" className={styles.linkBtn} onClick={inviteMember} disabled={!inviteUsername.trim()}>
                      Пригласить
                    </button>
                  </div>
                  <div className={styles.searchMembers}>
                    <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                    <input className={styles.search} placeholder="Поиск" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                  </div>
                  <div className={styles.inviteRow}>
                    <input
                      className={styles.input}
                      placeholder="username (например: ivanov)"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                    />
                  </div>
                  {loadingMembers ? (
                    <div className={styles.loadingState}><Loader2 size={18} className={styles.spinner} />Загрузка…</div>
                  ) : (
                    <div className={styles.memberTable}>
                      <div className={styles.memberHead}>
                        <div>Имя и email</div>
                        <div>Роль</div>
                      </div>
                      {groupMembers
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
                          <div key={m.id} className={styles.memberRow2}>
                            <div className={styles.memberCell}>
                              <div className={styles.avatarStub}>{String(m?.user?.email || 'U').charAt(0).toUpperCase()}</div>
                              <div>
                                <div className={styles.memberEmail}>
                                  {m?.user?.username ? `@${m.user.username}` : m?.user?.email || `User #${m.userId}`}
                                </div>
                                {m?.user?.username && m?.user?.email ? (
                                  <div className={styles.gMutedSmall}>{m.user.email}</div>
                                ) : null}
                                <div className={styles.gMutedSmall}>{m.status}</div>
                              </div>
                            </div>
                            <div className={styles.memberRole}>
                              <span className={styles.rolePill}>{m.role === 'OWNER' ? 'Владелец' : m.role === 'ADMIN' ? 'Админ' : 'Участник'}</span>
                              {selectedGroup.myRole === 'OWNER' && m.role !== 'OWNER' ? (
                                <button type="button" className={styles.smallBtn} onClick={() => toggleAdmin(m)}>
                                  {m.role === 'ADMIN' ? 'Снять админа' : 'Сделать админом'}
                                </button>
                              ) : null}
                              {canManageSelectedGroup && m.role !== 'OWNER' ? (
                                <button type="button" className={styles.smallBtnDanger} onClick={() => removeMember(m)}>
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

              {groupSettingsTab === 'permissions' ? (
                <div className={styles.gBody}>
                  <div className={styles.gSectionTitle}>Приглашение по ссылке</div>
                  <div className={styles.gMuted}>
                    Если доступ по ссылке разрешен, то к группе могут присоединиться все, у кого есть специальная ссылка для присоединения к группе.
                  </div>
                  <div className={styles.inviteLinkBox}>
                    <input
                      className={styles.input}
                      readOnly
                      value={`${appOrigin}/home?invite=${selectedGroup.inviteCode || ''}`}
                    />
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={async () => {
                        const link = `${appOrigin}/home?invite=${selectedGroup.inviteCode || ''}`;
                        const ok = await copyText(link);
                        if (!ok) alert(link);
                      }}
                    >
                      Скопировать
                    </button>
                  </div>
                  <button type="button" className={styles.btnGhost} onClick={regenInviteCode} disabled={regeneratingInviteCode}>
                    {regeneratingInviteCode ? <Loader2 size={16} className={styles.spinner} /> : null}
                    Перегенерировать ссылку
                  </button>
                </div>
              ) : null}

              {groupSettingsTab === 'invites' ? (
                <div className={styles.gBody}>
                  <div className={styles.gSectionTitle}>Запросы на добавление в группу</div>
                  <div className={styles.gMuted}>При добавлении в группу, пользователь получает все возможности участника группы.</div>
                  {loadingRequests ? (
                    <div className={styles.loadingState}><Loader2 size={18} className={styles.spinner} />Загрузка…</div>
                  ) : groupRequests.length ? (
                    <div className={styles.reqList}>
                      {groupRequests.map((r) => (
                        <div key={r.id} className={styles.reqRow}>
                          <div>{r.user?.email || `User #${r.userId}`}</div>
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
        </div>
      ) : null}
    </div>
  );
}
