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
import { FilterSelect, SearchInput, Select, Textarea } from '../../components/forms/Form';
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

function DetailModal({ target, canReview, onClose, onChanged }) {
  const [remarks, setRemarks] = useState('');
  const [role, setRole] = useState(target.role);
  const [deciding, setDeciding] = useState(null);
  const { busy, run } = useSubmit();
  const reviewable = canReview && target.emailVerified && target.approvalStatus === 'PENDING';
  const decide = decision => { setDeciding(decision); run(null, () => api.post(`/users/${target._id}/${decision}`, { remarks: remarks.trim() || undefined, ...(decision === 'approve' ? { role } : {}) }), { onDone: () => { onChanged(); onClose(); } }); };
  return (
    <Modal open onClose={onClose} size="lg" title={target.name} description={target.email} dismissible={!busy}
      footer={reviewable ? (
        <>
          <Button onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="danger" loading={busy && deciding === 'reject'} disabled={busy} onClick={() => decide('reject')}>Reject</Button>
          <Button variant="primary" loading={busy && deciding === 'approve'} disabled={busy} onClick={() => decide('approve')}>Approve registration</Button>
        </>
      ) : <Button onClick={onClose}>Close</Button>}>
      <div className="detail-head">
        <Avatar name={target.name} src={target.profilePhoto?.url} size={44} /><Badge tone="blue" dot={false}>{ROLE_LABELS[target.role]}</Badge><Badge status={target.status} />
        <Badge tone={target.emailVerified ? 'green' : 'amber'} dot={false}>{target.emailVerified ? 'Email verified' : 'Email not verified'}</Badge>
        {target.approvalStatus && <Badge status={target.approvalStatus} />}
      </div>
      <dl className="detail-list">
        <div className="span-2"><dt>College</dt><dd>{target.college || '—'}</dd></div>
        <div><dt>Department</dt><dd>{target.department || '—'}</dd></div>
        <div><dt>Branch</dt><dd>{target.branch || '—'}</dd></div>
        <div><dt>Roll number</dt><dd className="mono">{target.rollNumber || '—'}</dd></div>
        <div><dt>Contact</dt><dd>{target.contact || '—'}</dd></div>
        {target.startupName && <div><dt>Startup</dt><dd>{target.startupName}</dd></div>}
        <div className="span-2"><dt>Purpose</dt><dd>{target.purpose || 'Not provided'}</dd></div>
        <div><dt>User ID</dt><dd className="mono">{target._id}</dd></div>
        <div><dt>Registered</dt><dd>{fmtDate(target.createdAt)}</dd></div>
        <div><dt>Last sign-in</dt><dd>{target.lastLogin ? fmtDateTime(target.lastLogin) : 'Never'}</dd></div>
        {target.approvalRemarks && <div className="span-2"><dt>Review remarks</dt><dd>{target.approvalRemarks}</dd></div>}
      </dl>
      {reviewable && (
        <div className="stack" style={{ marginTop: 16 }}>
          <Select label="Approve as" options={['STUDENT', 'INTERN', 'FOUNDER'].map(r => ({ value: r, label: ROLE_LABELS[r] }))} value={role} onChange={e => setRole(e.target.value)} hint="The role requested at registration is pre-selected. Administrative roles are never granted here." />
          <Textarea label="Remarks" hint="Optional. Shown to the applicant if rejected." maxLength={300} value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>
      )}
      {canReview && target.approvalStatus === 'PENDING' && !target.emailVerified && <p className="notice notice--warn" style={{ marginTop: 16 }}>This applicant has not verified their email yet, so the registration cannot be approved.</p>}
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
      can(P.ROLE_MATRIX) && t.approvalStatus === 'PENDING' && t.emailVerified && { label: 'Review registration', icon: UserCheck, onClick: () => setModal({ type: 'detail', target: t }) },
      can(P.USER_ROLE) && manageable && { label: 'Change role', icon: Shield, onClick: () => setModal({ type: 'role', target: t }) },
      can(P.USER_STATUS) && manageable && !['PENDING_APPROVAL', 'PENDING_VERIFICATION', 'REJECTED'].includes(t.status) && (t.status === 'ACTIVE' ? { label: 'Deactivate', icon: UserX, danger: true, onClick: () => setModal({ type: 'deactivate', target: t }) } : { label: 'Activate', icon: UserCheck, onClick: () => setStatusOf(t, 'ACTIVE') }),
    ];
  };
  const columns = [
    { key: 'name', header: 'User', render: t => <span className="user-cell"><Avatar name={t.name} src={t.profilePhoto?.url} size={32} /><span className="cell-stack"><strong>{t.name}</strong><small>{t.email}</small></span></span> },
    { key: 'college', header: 'College / roll', render: t => (t.college ? <span className="cell-stack"><strong>{t.college.replace('KIPM - College of ', 'KIPM · ')}</strong><small>Roll {t.rollNumber || '—'}</small></span> : '—') },
    { key: 'department', header: 'Department · branch', render: t => [t.department, t.branch].filter(Boolean).join(' · ') || t.startupName || '—' },
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
            <StatCard icon={UserX} tone="amber" label="Awaiting approval" value={u.pending ?? 0} hint={`${u.unverified ?? 0} email not verified`} />
            <StatCard icon={UserX} tone="red" label="Deactivated" value={u.deactivated ?? 0} />
          </StatGrid>
          <div className="toolbar">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or department" label="Search users" />
            <FilterSelect label="Role" value={role} onChange={setRole} options={ALL_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))} allLabel="All roles" />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={['ACTIVE', 'PENDING_APPROVAL', 'PENDING_VERIFICATION', 'REJECTED', 'DEACTIVATED'].map(s => ({ value: s, label: s === 'PENDING_APPROVAL' ? 'Awaiting approval' : s === 'PENDING_VERIFICATION' ? 'Email not verified' : titleCase(s) }))} allLabel="All statuses" />
          </div>
          {list.error && !list.rows.length ? <ErrorState onRetry={list.reload} /> : (
            <DataTable columns={columns} rows={list.rows} caption="Users" onRowClick={t => setModal({ type: 'detail', target: t })}
              server={{ page: list.page, totalPages: list.pagination.totalPages, total: list.pagination.total, size: list.size, onPage: list.setPage, onSize: list.setSize, loading: list.loading }}
              empty={<EmptyState icon={UsersIcon} title="No users found" description="There are currently no users matching your filters." action={<Button onClick={() => { setSearch(''); setRole(''); setStatus(''); }}>Clear filters</Button>} />} />
          )}
        </>
      )}
      {modal?.type === 'detail' && <DetailModal target={modal.target} canReview={can(P.ROLE_MATRIX)} onClose={close} onChanged={refresh} />}
      {modal?.type === 'role' && <RoleModal target={modal.target} actor={user} onClose={close} onDone={refresh} />}
      <ConfirmDialog open={modal?.type === 'deactivate'} tone="danger" title={`Deactivate ${modal?.target?.name}?`} confirmLabel="Deactivate" busy={rowAction.pending === 'deact'}
        message="They can no longer sign in and active sessions end. Records and history are kept; you can activate the account again at any time." onCancel={close}
        onConfirm={() => rowAction.run('deact', () => api.patch(`/users/${modal.target._id}/status`, { status: 'DEACTIVATED' }), { onDone: () => { close(); refresh(); } })} />
    </div>
  );
}
