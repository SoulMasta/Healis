import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, LayoutGrid, CalendarDays, Settings, Plus, X, Loader2, Trash2, Users } from 'lucide-react';
import { getAllWorkspaces, createWorkspace, deleteWorkspace } from '../http/workspaceAPI';
import { getToken } from '../http/userAPI';
import {
  acceptGroupInvite,
  createGroup,
  createGroupDesk,
  declineGroupInvite,
  deleteGroup,
  getGroupDesks,
  getGroupMembers,
  getMyGroupInvites,
  getMyGroups,
  inviteToGroup,
  removeGroupMember,
  setGroupMemberRole,
  updateGroup,
} from '../http/groupAPI';
import UserMenu from '../components/UserMenu';
import styles from '../styles/HomePage.module.css';

const MENU = [
  { key: 'workspace', label: 'Workspace', icon: LayoutGrid, to: '/workspace' },
  { key: 'groups', label: 'Groups', icon: Users, to: '/home' },
  { key: 'calendar', label: 'Calendar of events', icon: CalendarDays, to: '/calendar' },
  { key: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
];



function CreateBoardModal({ isOpen, onClose, onCreate, loading, title = 'Create New Board', submitLabel = 'Create Board' }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label htmlFor="boardName" className={styles.formLabel}>Board Name *</label>
            <input
              id="boardName"
              type="text"
              className={styles.formInput}
              placeholder="Enter board name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="boardDesc" className={styles.formLabel}>Description (optional)</label>
            <textarea
              id="boardDesc"
              className={styles.formTextarea}
              placeholder="Add a description for your board..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim() || loading}>
              {loading ? <Loader2 size={18} className={styles.spinner} /> : null}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkspaceCard({ workspace, onOpen, onDelete, deleting, canDelete = true, badge }) {
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  ];
  const gradient = gradients[workspace.id % gradients.length];

  return (
    <div
      className={styles.workspaceCard}
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
      <div className={styles.workspaceThumb} style={{ background: gradient }}>
        {canDelete ? (
          <button
            type="button"
            className={styles.workspaceDeleteBtn}
            aria-label={`Delete board "${workspace.name}"`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            disabled={deleting}
            title="Delete board"
          >
            {deleting ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
          </button>
        ) : null}
        <span className={styles.workspaceInitial}>{workspace.name.charAt(0).toUpperCase()}</span>
      </div>
      <div className={styles.workspaceInfo}>
        <div className={styles.workspaceName}>
          {workspace.name}
          {badge ? <span className={styles.badge}>{badge}</span> : null}
        </div>
        {workspace.description && (
          <div className={styles.workspaceDesc}>{workspace.description}</div>
        )}
      </div>
    </div>
  );
}

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

export default function HomePage() {
  const [active, setActive] = useState(MENU[0].key);
  const [workspaces, setWorkspaces] = useState([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState(null);
  const [token, setToken] = useState(() => getToken());
  const user = useMemo(() => (token ? safeParseJwt(token) : null), [token]);
  const myUserId = user?.id;

  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [groupDesks, setGroupDesks] = useState({}); // groupId -> { desks, canManage, myRole }
  const [loadingGroupDesks, setLoadingGroupDesks] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState('');
  const [groupDraftDesc, setGroupDraftDesc] = useState('');

  const [createDeskTargetGroupId, setCreateDeskTargetGroupId] = useState(null); // null -> personal
  const navigate = useNavigate();

  const activeItem = MENU.find((m) => m.key === active) || MENU[0];
  const inviteCount = invites.length;

  const handleMenuClick = (item) => {
    if (!item?.key) return;
    setActive(item.key);
    // Open standalone pages immediately (no extra "Let's start" click).
    if (item.key === 'calendar' || item.key === 'settings') {
      navigate(item.to);
    }
  };

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      return;
    }
    setLoadingWorkspaces(true);
    try {
      const data = await getAllWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      if (err?.response?.status === 401) setWorkspaces([]);
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    if (!token) {
      setGroups([]);
      return [];
    }
    setLoadingGroups(true);
    try {
      const data = await getMyGroups();
      setGroups(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load groups:', err);
      if (err?.response?.status === 401) setGroups([]);
      return [];
    } finally {
      setLoadingGroups(false);
    }
  }, [token]);

  const fetchInvites = useCallback(async () => {
    if (!token) {
      setInvites([]);
      return [];
    }
    setLoadingInvites(true);
    try {
      const data = await getMyGroupInvites();
      setInvites(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load invites:', err);
      if (err?.response?.status === 401) setInvites([]);
      return [];
    } finally {
      setLoadingInvites(false);
    }
  }, [token]);

  const fetchGroupDesksFor = useCallback(async (groupsList) => {
    if (!token) {
      setGroupDesks({});
      return;
    }
    const list = Array.isArray(groupsList) ? groupsList : [];
    if (!list.length) {
      setGroupDesks({});
      return;
    }
    setLoadingGroupDesks(true);
    try {
      const results = await Promise.all(
        list.map(async (g) => {
          try {
            const payload = await getGroupDesks(g.groupId);
            return [g.groupId, payload];
          } catch {
            return [g.groupId, { desks: [], canManage: false, myRole: g.myRole }];
          }
        })
      );
      const map = {};
      for (const [gid, payload] of results) {
        map[gid] = payload;
      }
      setGroupDesks(map);
    } finally {
      setLoadingGroupDesks(false);
    }
  }, [token]);

  useEffect(() => {
    if (active === 'workspace') {
      fetchWorkspaces();
      fetchGroups().then((gs) => fetchGroupDesksFor(gs));
      fetchInvites();
    }
    if (active === 'groups') {
      fetchInvites();
      fetchGroups();
    }
  }, [active, fetchWorkspaces, fetchGroups, fetchInvites, fetchGroupDesksFor]);

  const handleCreateBoard = async ({ name, description }) => {
    setCreating(true);
    try {
      const targetGroupId = createDeskTargetGroupId;
      const newWorkspace = targetGroupId
        ? await createGroupDesk(targetGroupId, { name, description })
        : await createWorkspace({ name, description });
      setShowCreateModal(false);
      setCreateDeskTargetGroupId(null);
      navigate(`/workspace/${newWorkspace.id}`);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      alert(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleWorkspaceClick = (workspace) => {
    navigate(`/workspace/${workspace.id}`);
  };

  const handleDeleteBoard = async (workspace) => {
    if (!workspace?.id) return;
    if (!token) return;
    const ok = window.confirm(`Удалить доску "${workspace.name}"? Это действие нельзя отменить.`);
    if (!ok) return;

    setDeletingWorkspaceId(workspace.id);
    try {
      await deleteWorkspace(workspace.id);
      setWorkspaces((prev) => prev.filter((x) => x.id !== workspace.id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete workspace:', err?.response?.data || err);
      alert(err.response?.data?.error || 'Failed to delete workspace');
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const handleAcceptInvite = async (invite) => {
    if (!invite?.groupId) return;
    try {
      await acceptGroupInvite(invite.groupId);
      await fetchInvites();
      const gs = await fetchGroups();
      setSelectedGroupId((prev) => prev || (gs[0]?.groupId ?? null));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to accept invite:', err);
      alert(err?.response?.data?.error || 'Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (invite) => {
    if (!invite?.groupId) return;
    try {
      await declineGroupInvite(invite.groupId);
      await fetchInvites();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to decline invite:', err);
      alert(err?.response?.data?.error || 'Failed to decline invite');
    }
  };

  const selectedGroup = useMemo(
    () => groups.find((g) => g.groupId === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  useEffect(() => {
    if (!token) return;
    if (active !== 'groups') return;
    if (!selectedGroupId && groups.length) setSelectedGroupId(groups[0].groupId);
  }, [active, groups, selectedGroupId, token]);

  const loadMembers = useCallback(async (groupId) => {
    if (!token || !groupId) {
      setGroupMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const data = await getGroupMembers(groupId);
      setGroupMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load group members:', err);
      setGroupMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [token]);

  useEffect(() => {
    if (active !== 'groups') return;
    if (!selectedGroupId) return;
    loadMembers(selectedGroupId);
  }, [active, selectedGroupId, loadMembers]);

  const openCreateGroup = () => {
    setGroupDraftName('');
    setGroupDraftDesc('');
    setShowCreateGroupModal(true);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupDraftName.trim()) return;
    setCreatingGroup(true);
    try {
      const g = await createGroup({ name: groupDraftName.trim(), description: groupDraftDesc.trim() });
      setShowCreateGroupModal(false);
      const gs = await fetchGroups();
      setSelectedGroupId(g?.groupId || gs[0]?.groupId || null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create group:', err);
      alert(err?.response?.data?.error || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const beginEditGroup = () => {
    if (!selectedGroup) return;
    setGroupDraftName(selectedGroup.name || '');
    setGroupDraftDesc(selectedGroup.description || '');
    setEditingGroup(true);
  };

  const saveEditGroup = async () => {
    if (!selectedGroup) return;
    setEditingGroup(false);
    try {
      await updateGroup(selectedGroup.groupId, { name: groupDraftName.trim(), description: groupDraftDesc.trim() });
      await fetchGroups();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to update group:', err);
      alert(err?.response?.data?.error || 'Failed to update group');
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !inviteEmail.trim()) return;
    try {
      await inviteToGroup(selectedGroup.groupId, { email: inviteEmail.trim() });
      setInviteEmail('');
      await loadMembers(selectedGroup.groupId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to invite:', err);
      alert(err?.response?.data?.error || 'Failed to invite');
    }
  };

  const canManageSelectedGroup = selectedGroup?.myRole === 'OWNER' || selectedGroup?.myRole === 'ADMIN';
  const isOwnerSelectedGroup = selectedGroup?.myRole === 'OWNER';

  const handleToggleAdmin = async (member) => {
    if (!selectedGroup || !member?.userId) return;
    const nextRole = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    try {
      await setGroupMemberRole(selectedGroup.groupId, member.userId, nextRole);
      await loadMembers(selectedGroup.groupId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to set role:', err);
      alert(err?.response?.data?.error || 'Failed to set role');
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selectedGroup || !member?.userId) return;
    const ok = window.confirm(`Удалить пользователя ${member?.user?.email || member.userId} из группы?`);
    if (!ok) return;
    try {
      await removeGroupMember(selectedGroup.groupId, member.userId);
      await loadMembers(selectedGroup.groupId);
      if (member.userId === myUserId) {
        const gs = await fetchGroups();
        setSelectedGroupId(gs[0]?.groupId || null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove member:', err);
      alert(err?.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleDeleteSelectedGroup = async () => {
    if (!selectedGroup) return;
    const ok = window.confirm(`Удалить группу "${selectedGroup.name}"? Это действие нельзя отменить.`);
    if (!ok) return;
    try {
      await deleteGroup(selectedGroup.groupId);
      const gs = await fetchGroups();
      setSelectedGroupId(gs[0]?.groupId || null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete group:', err);
      alert(err?.response?.data?.error || 'Failed to delete group');
    }
  };

  const renderWorkspaceContent = () => {
    if (!token) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <LayoutGrid size={48} />
          </div>
          <div className={styles.emptyTitle}>Sign in to see your boards</div>
          <div className={styles.emptySub}>Boards can be personal or belong to a group — sign in to see them.</div>
          <button type="button" className={styles.createFirstBtn} onClick={() => navigate('/auth')}>
            Sign in
          </button>
        </div>
      );
    }

    if (loadingWorkspaces || loadingGroups || loadingInvites || loadingGroupDesks) {
      return (
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <span>Loading workspace data...</span>
        </div>
      );
    }

    const hasPersonal = workspaces.length > 0;
    const hasGroupBoards = groups.some((g) => (groupDesks[g.groupId]?.desks || []).length > 0);

    if (!hasPersonal && !hasGroupBoards) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <LayoutGrid size={48} />
          </div>
          <div className={styles.emptyTitle}>No boards yet</div>
          <div className={styles.emptySub}>Create a personal board, or join a group to collaborate.</div>
          <button
            type="button"
            className={styles.createFirstBtn}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={18} />
            Create Board
          </button>
        </div>
      );
    }

    return (
      <div className={styles.workspaceSections}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Personal boards</div>
            <div className={styles.sectionSub}>Your private workspaces</div>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setCreateDeskTargetGroupId(null);
              setShowCreateModal(true);
            }}
          >
            <Plus size={18} />
            New personal board
          </button>
        </div>

        <div className={styles.workspaceGrid}>
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={`p-${ws.id}`}
              workspace={ws}
              onOpen={() => handleWorkspaceClick(ws)}
              onDelete={() => handleDeleteBoard(ws)}
              deleting={deletingWorkspaceId === ws.id}
              canDelete
            />
          ))}
        </div>

        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Group boards</div>
            <div className={styles.sectionSub}>Boards shared inside your groups</div>
          </div>
          <button type="button" className={styles.ghost} onClick={() => setActive('groups')}>
            Manage groups
            <ChevronRight size={16} />
          </button>
        </div>

        {groups.length === 0 ? (
          <div className={styles.emptyInline}>
            You are not in any groups yet. Create one in <b>Groups</b> tab, or accept an invite.
          </div>
        ) : (
          <div className={styles.groupBoardsList}>
            {groups.map((g) => {
              const payload = groupDesks[g.groupId] || { desks: [], canManage: false, myRole: g.myRole };
              const desks = payload.desks || [];
              const canManage = Boolean(payload.canManage);
              return (
                <div key={g.groupId} className={styles.groupSection}>
                  <div className={styles.groupSectionTop}>
                    <div className={styles.groupSectionTitle}>
                      <span>{g.name}</span>
                      <span className={styles.miniPill}>{g.myRole}</span>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => {
                          setCreateDeskTargetGroupId(g.groupId);
                          setShowCreateModal(true);
                        }}
                      >
                        <Plus size={18} />
                        New group board
                      </button>
                    ) : (
                      <div className={styles.hint}>Only admins can create boards</div>
                    )}
                  </div>

                  {desks.length ? (
                    <div className={styles.workspaceGrid}>
                      {desks.map((ws) => (
                        <WorkspaceCard
                          key={`g-${g.groupId}-${ws.id}`}
                          workspace={ws}
                          onOpen={() => handleWorkspaceClick(ws)}
                          onDelete={() => handleDeleteBoard(ws)}
                          deleting={deletingWorkspaceId === ws.id}
                          canDelete={canManage}
                          badge="Group"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>No boards in this group yet.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderGroupsContent = () => {
    if (!token) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Users size={48} />
          </div>
          <div className={styles.emptyTitle}>Sign in to use groups</div>
          <div className={styles.emptySub}>Create groups, invite teammates, and collaborate on boards.</div>
          <button type="button" className={styles.createFirstBtn} onClick={() => navigate('/auth')}>
            Sign in
          </button>
        </div>
      );
    }

    if (loadingGroups || loadingInvites) {
      return (
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <span>Loading groups...</span>
        </div>
      );
    }

    return (
      <div className={styles.groupsLayout}>
        <div className={styles.groupsLeft}>
          <div className={styles.sectionHeaderTight}>
            <div>
              <div className={styles.sectionTitle}>Invitations</div>
              <div className={styles.sectionSub}>Incoming group invites</div>
            </div>
          </div>

          {invites.length ? (
            <div className={styles.inviteList}>
              {invites.map((inv) => (
                <div key={inv.id} className={styles.inviteCard}>
                  <div className={styles.inviteMain}>
                    <div className={styles.inviteTitle}>{inv.group?.name || `Group #${inv.groupId}`}</div>
                    <div className={styles.inviteSub}>Role: {inv.role}</div>
                  </div>
                  <div className={styles.inviteActions}>
                    <button type="button" className={styles.secondary} onClick={() => handleAcceptInvite(inv)}>
                      Accept
                    </button>
                    <button type="button" className={styles.dangerGhost} onClick={() => handleDeclineInvite(inv)}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyInline}>No invites right now.</div>
          )}

          <div className={styles.sectionHeaderTight}>
            <div>
              <div className={styles.sectionTitle}>Your groups</div>
              <div className={styles.sectionSub}>Pick a group to manage members</div>
            </div>
            <button type="button" className={styles.secondary} onClick={openCreateGroup}>
              <Plus size={18} />
              New group
            </button>
          </div>

          {groups.length ? (
            <div className={styles.groupList}>
              {groups.map((g) => (
                <button
                  key={g.groupId}
                  type="button"
                  className={`${styles.groupListItem} ${g.groupId === selectedGroupId ? styles.groupListItemActive : ''}`}
                  onClick={() => setSelectedGroupId(g.groupId)}
                >
                  <span className={styles.groupListName}>{g.name}</span>
                  <span className={styles.miniPill}>{g.myRole}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyInline}>Create a group to start collaborating.</div>
          )}
        </div>

        <div className={styles.groupsRight}>
          {!selectedGroup ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>Select a group</div>
              <div className={styles.emptySub}>Choose a group on the left to manage members and invites.</div>
            </div>
          ) : (
            <div className={styles.groupDetails}>
              <div className={styles.groupDetailsTop}>
                <div className={styles.groupDetailsTitleRow}>
                  {!editingGroup ? (
                    <div className={styles.groupDetailsTitle}>{selectedGroup.name}</div>
                  ) : (
                    <input
                      className={styles.input}
                      value={groupDraftName}
                      onChange={(e) => setGroupDraftName(e.target.value)}
                      placeholder="Group name"
                    />
                  )}
                  <span className={styles.miniPill}>{selectedGroup.myRole}</span>
                </div>

                {!editingGroup ? (
                  <div className={styles.groupDetailsDesc}>{selectedGroup.description || 'No description'}</div>
                ) : (
                  <textarea
                    className={styles.textarea}
                    value={groupDraftDesc}
                    onChange={(e) => setGroupDraftDesc(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                  />
                )}

                <div className={styles.inlineActions}>
                  {canManageSelectedGroup ? (
                    !editingGroup ? (
                      <button type="button" className={styles.secondary} onClick={beginEditGroup}>
                        Edit group
                      </button>
                    ) : (
                      <button type="button" className={styles.secondary} onClick={saveEditGroup}>
                        Save
                      </button>
                    )
                  ) : null}

                  {selectedGroup.myRole !== 'OWNER' ? (
                    <button
                      type="button"
                      className={styles.dangerGhost}
                      onClick={() => handleRemoveMember({ userId: myUserId, user: { email: user?.email } })}
                    >
                      Leave group
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.dangerGhost}
                      disabled={!isOwnerSelectedGroup}
                      onClick={handleDeleteSelectedGroup}
                      title="Only owner can delete group"
                    >
                      Delete group
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.sectionHeaderTight}>
                <div>
                  <div className={styles.sectionTitle}>Members</div>
                  <div className={styles.sectionSub}>Roles: OWNER / ADMIN / MEMBER</div>
                </div>
              </div>

              {loadingMembers ? (
                <div className={styles.loadingInline}>
                  <Loader2 size={18} className={styles.spinner} />
                  <span>Loading members...</span>
                </div>
              ) : (
                <div className={styles.memberList}>
                  {groupMembers.map((m) => {
                    const email = m.user?.email || `User #${m.userId}`;
                    const isOwner = m.role === 'OWNER';
                    const canKick = canManageSelectedGroup && !isOwner;
                    const canToggleAdmin = isOwnerSelectedGroup && !isOwner && m.status === 'ACTIVE';
                    return (
                      <div key={m.id} className={styles.memberRow}>
                        <div className={styles.memberMain}>
                          <div className={styles.memberEmail}>{email}</div>
                          <div className={styles.memberMeta}>
                            <span className={styles.miniPill}>{m.role}</span>
                            <span className={styles.miniPillMuted}>{m.status}</span>
                          </div>
                        </div>
                        <div className={styles.memberActions}>
                          {canToggleAdmin ? (
                            <button type="button" className={styles.ghost} onClick={() => handleToggleAdmin(m)}>
                              {m.role === 'ADMIN' ? 'Make member' : 'Make admin'}
                            </button>
                          ) : null}
                          {canKick ? (
                            <button type="button" className={styles.dangerGhost} onClick={() => handleRemoveMember(m)}>
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={styles.sectionHeaderTight}>
                <div>
                  <div className={styles.sectionTitle}>Invite</div>
                  <div className={styles.sectionSub}>Invite by email (admins/owner)</div>
                </div>
              </div>

              <form className={styles.inviteForm} onSubmit={handleInvite}>
                <input
                  className={styles.input}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  disabled={!canManageSelectedGroup}
                />
                <button type="submit" className={styles.secondary} disabled={!canManageSelectedGroup || !inviteEmail.trim()}>
                  Invite
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>H</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>Healis</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <UserMenu />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <aside className={styles.left}>
            <div className={styles.leftTitle}>Start</div>
            <nav className={styles.nav} aria-label="Main menu">
              {MENU.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    onClick={() => handleMenuClick(item)}
                  >
                    <span className={styles.navIcon} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className={styles.navLabel}>
                      {item.label}
                      {item.key === 'groups' && inviteCount > 0 ? (
                        <span className={styles.navBadge} title="Invites">
                          {inviteCount}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.navChevron} aria-hidden="true">
                      <ChevronRight size={16} />
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className={styles.right}>
            <div className={styles.rightTop}>
              <div>
                <div className={styles.rightTitle}>{activeItem.label}</div>
                <div className={styles.rightSub}>
                  {active === 'workspace'
                    ? 'Your boards and workspaces'
                    : active === 'groups'
                      ? 'Teams, roles and invitations'
                    : 'Pick a page and continue'}
                </div>
              </div>
              {active !== 'workspace' && active !== 'groups' && (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => navigate(activeItem.to)}
                >
                  Let&apos;s start
                </button>
              )}
            </div>

            {active === 'workspace' ? renderWorkspaceContent() : active === 'groups' ? renderGroupsContent() : (
              <div className={styles.preview}>
              </div>
            )}
          </section>
        </div>
      </main>

      <CreateBoardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateBoard}
        loading={creating}
        title={createDeskTargetGroupId ? 'Create Group Board' : 'Create New Board'}
        submitLabel={createDeskTargetGroupId ? 'Create Group Board' : 'Create Board'}
      />

      {showCreateGroupModal ? (
        <div className={styles.modalOverlay} onClick={() => setShowCreateGroupModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Create Group</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setShowCreateGroupModal(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label htmlFor="groupName" className={styles.formLabel}>Group Name *</label>
                <input
                  id="groupName"
                  type="text"
                  className={styles.formInput}
                  placeholder="Enter group name..."
                  value={groupDraftName}
                  onChange={(e) => setGroupDraftName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="groupDesc" className={styles.formLabel}>Description (optional)</label>
                <textarea
                  id="groupDesc"
                  className={styles.formTextarea}
                  placeholder="Add a description..."
                  value={groupDraftDesc}
                  onChange={(e) => setGroupDraftDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowCreateGroupModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn} disabled={!groupDraftName.trim() || creatingGroup}>
                  {creatingGroup ? <Loader2 size={18} className={styles.spinner} /> : null}
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
