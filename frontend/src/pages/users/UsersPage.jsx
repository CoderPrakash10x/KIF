import { useEffect, useId, useState } from 'react';
import { Check, MoreHorizontal, Shield, UserCheck, UserX, Users as UsersIcon } from 'lucide-react';
import { ALL_ROLES, PERMISSIONS as P, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, canManageUser, isMemberRole } from '../../constants/roles';
import { useAuth, useCan } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { useApi, useServerList } from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useFields from '../../hooks/useFields';
import useQueryParam from '../../hooks/useQueryParam';
import useRowAction from '../../hooks/useRowAction';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import { EmptyState, ErrorState } from '../../components/common/Feedback';
import Avatar from '../../components/ui/Avatar';
import Button, { IconButton } from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dropdown from '../../components/ui/Dropdown';
import { Card, StatCard, StatGrid } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { FilterSelect, SearchInput, Select } from '../../components/forms/Form';
import DataTable from '../../components/tables/DataTable';
import { ConfirmDialog, FormFooter, Modal } from '../../components/modals/Modal';
import { fmtDate, fmtDateTime, titleCase } from '../../utils/format';

function RoleModal({ target, actor, onClose, onDone }) {
  const formId = useId();
  const allowed = actor.role === 'SUPER_ADMIN' ? ALL_ROLES : ALL_ROLES.filter(isMemberRole).concat(['FOUNDER']);
  const f = useFields({ role: target.role });
  const { busy, errors, run } = useSubmit();
  return (
    <Modal open onClose={onClose} size="sm" title={`Change role · ${target.name}`} dismissible={!busy}
      footer={<FormFooter formId={formId} onCancel={onClose} busy={busy} submitLabel="Update role" disabled={f.values.role === target.role} />}>
      <form id={formId} noValidate className="stack" onSubmit={e => { e.preventDefault(); run(null, () => api.post('/users/assign-role', { userId: target._id, role: f.values.role }), { onDone: () => { onDone(); onClose(); } }); }}>
        <Select label="Role" required options={[...new Set(allowed)].map(r => ({ value: r, label: ROLE_LABELS[r] }))} value={f.values.role} onChange={e => f.set('role', e.target.value)} error={errors.role} />
        <p className="muted">{ROLE_DESCRIPTIONS[f.values.role]}</p>
        <p className="notice notice--warn">Role changes apply on the person's next request and are written to the audit log.</p>
      </form>
    </Modal>
  );
}

function DetailModal({ target, onClose }) {
  return (
    <Modal open onClose={onClose} title={target.name} description={target.email} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="detail-head"><Avatar name={target.name} src={target.profilePhoto?.url} size={44} /><Badge tone="blue" dot={false}>{ROLE_LABELS[target.role]}</Badge><Badge status={target.status} /></div>
      <dl className="detail-list">
        <div><dt>User ID</dt><dd className="mono">{target._id}</dd></div>
        <div><dt>Department</dt><dd>{target.department || '—'}</dd></div>
        <div><dt>Startup</dt><dd>{target.startupName || '—'}</dd></div>
        <div><dt>Contact</dt><dd>{target.contact || '—'}</dd></div>
        <div><dt>Joined</dt><dd>{fmtDate(target.createdAt)}</dd></div>
        <div><dt>Last sign-in</dt><dd>{target.lastLogin ? fmtDateTime(target.lastLogin) : 'Never'}</dd></div>
        <div><dt>Email verified</dt><dd>{target.emailVerified ? 'Yes' : 'No'}</dd></div>
      </dl>
    </Modal>
  );
}

const humanize = k => k.toLowerCase().split('_').slice(1).join(' ') || k.toLowerCase();
function PermissionMatrix() {
  const all = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
  const groups = [...new Set(all.map(p => p.split('_')[0]))];
  return (
    <Card title="Roles & permissions" description="What each role is shown in the interface. The server enforces the same boundaries on every request." flush>
      <div className="table-wrap table-wrap--scroll">
        <table className="table matrix">
          <thead><tr><th scope="col">Permission</th>{ALL_ROLES.map(r => <th key={r} scope="col" className="matrix__role">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>
            {groups.map(g => (
              <GroupRows key={g} group={g} perms={all.filter(p => p.split('_')[0] === g)} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function GroupRows({ group, perms }) {
  return (
    <>
      <tr className="matrix__group"><th colSpan={ALL_ROLES.length + 1} scope="colgroup">{group.charAt(0) + group.slice(1).toLowerCase()}</th></tr>
      {perms.map(p => (
        <tr key={p}>
          <th scope="row" className="matrix__perm">{humanize(p)}<small className="mono">{p}</small></th>
          {ALL_ROLES.map(r => <td key={r} className="matrix__cell">{ROLE_PERMISSIONS[r].includes(p) ? <Check size={16} aria-label="Allowed" /> : <span className="muted" aria-label="Not allowed">–</span>}</td>)}
        </tr>
      ))}
    </>
  );
}

export default function UsersPage() {
  const { user } = useAuth();
  const can = useCan();
  const rowAction = useRowAction();
  const q = useQueryParam('q');
  const [tab, setTab] = useState('directory');
  const [search, setSearch] = useState(q);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  useEffect(() => setSearch(q), [q]);
  const dq = useDebounce(search).trim();

  const list = useServerList('/users', { search: dq, role, status }, { pageSize: 10 });
  const summary = useApi(() => api.get('/dashboard/summary'), []);
  const u = summary.data?.data?.users || {};
  const refresh = () => { list.reload(); summary.reload(); };
  const close = () => setModal(null);
  const moreTrigger = props => <IconButton icon={MoreHorizontal} label="More actions" {...props} />;
  const setStatusOf = (t, s) => rowAction.run(t._id, () => api.patch(`/users/${t._id}/status`, { status: s }), { onDone: refresh });

  const menu = t => {
    const manageable = canManageUser(user, t);
    return [
      can(P.USER_ROLE) && manageable && { label: 'Change role', icon: Shield, onClick: () => setModal({ type: 'role', target: t }) },
      can(P.USER_STATUS) && manageable && (t.status === 'ACTIVE' ? { label: 'Deactivate', icon: UserX, danger: true, onClick: () => setModal({ type: 'deactivate', target: t }) } : { label: 'Activate', icon: UserCheck, onClick: () => setStatusOf(t, 'ACTIVE') }),
    ];
  };
  const columns = [
    { key: 'name', header: 'User', render: t => <span className="user-cell"><Avatar name={t.name} src={t.profilePhoto?.url} size={32} /><span className="cell-stack"><strong>{t.name}</strong><small>{t.email}</small></span></span> },
    { key: 'department', header: 'Department / startup', render: t => t.startupName || t.department || '—' },
    { key: 'role', header: 'Role', render: t => <Badge tone="blue" dot={false}>{ROLE_LABELS[t.role]}</Badge> },
    { key: 'status', header: 'Status', render: t => <Badge status={t.status} /> },
    { key: 'lastLogin', header: 'Last sign-in', render: t => (t.lastLogin ? fmtDate(t.lastLogin) : 'Never') },
    { key: 'actions', header: 'Actions', align: 'right', render: t => (
      <div className="row-actions"><Button size="sm" onClick={() => setModal({ type: 'detail', target: t })}>View</Button><Dropdown trigger={moreTrigger} items={menu(t)} label={`Actions for ${t.name}`} /></div>) },
  ];

  return (
    <div className="page">
      <PageHeader title="Users" description="Manage accounts, roles and access. Self-registered users appear as pending until activated." />
      {can(P.ROLE_MATRIX) && <Tabs label="Users sections" value={tab} onChange={setTab} tabs={[{ id: 'directory', label: 'Directory' }, { id: 'roles', label: 'Roles & permissions' }]} />}
      {tab === 'roles' && can(P.ROLE_MATRIX) ? <PermissionMatrix /> : (
        <>
          <StatGrid>
            <StatCard icon={UsersIcon} label="Total users" value={u.total ?? 0} />
            <StatCard icon={UserCheck} tone="green" label="Active" value={u.active ?? 0} />
            <StatCard icon={UserX} tone="amber" label="Pending activation" value={u.pending ?? 0} />
            <StatCard icon={UserX} tone="red" label="Deactivated" value={u.deactivated ?? 0} />
          </StatGrid>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or department" label="Search users" />
            <FilterSelect label="Role" value={role} onChange={setRole} options={ALL_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))} allLabel="All roles" />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={['ACTIVE', 'PENDING_VERIFICATION', 'DEACTIVATED'].map(s => ({ value: s, label: titleCase(s) }))} allLabel="All statuses" />
          </div>
          {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : (
            <DataTable columns={columns} rows={list.rows} caption="Users" onRowClick={t => setModal({ type: 'detail', target: t })}
              server={{ page: list.page, totalPages: list.pagination.totalPages, total: list.pagination.total, size: list.size, onPage: list.setPage, onSize: list.setSize, loading: list.loading }}
              empty={<EmptyState icon={UsersIcon} title="No users found" description="There are currently no users matching your filters." action={<Button onClick={() => { setSearch(''); setRole(''); setStatus(''); }}>Clear filters</Button>} />} />
          )}
        </>
      )}
      {modal?.type === 'detail' && <DetailModal target={modal.target} onClose={close} />}
      {modal?.type === 'role' && <RoleModal target={modal.target} actor={user} onClose={close} onDone={refresh} />}
      <ConfirmDialog open={modal?.type === 'deactivate'} tone="danger" title={`Deactivate ${modal?.target?.name}?`} confirmLabel="Deactivate" busy={rowAction.pending === 'deact'}
        message="They can no longer sign in and active sessions end. Records and history are kept; you can activate the account again at any time." onCancel={close}
        onConfirm={() => rowAction.run('deact', () => api.patch(`/users/${modal.target._id}/status`, { status: 'DEACTIVATED' }), { onDone: () => { close(); refresh(); } })} />
    </div>
  );
}
