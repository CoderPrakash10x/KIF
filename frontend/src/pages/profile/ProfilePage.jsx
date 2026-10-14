import { useId, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../constants/roles';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, toUserMessage } from '../../lib/api';
import useFields from '../../hooks/useFields';
import useSubmit from '../../hooks/useSubmit';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/forms/Form';
import { fmtDate, fmtDateTime } from '../../utils/format';

const MAX_PHOTO = 5 * 1024 * 1024;

function PasswordCard() {
  const f = useFields({ currentPassword: '', newPassword: '', confirm: '' });
  const { busy, errors, run } = useSubmit();
  const v = f.values;
  const validate = () => {
    const e = {};
    if (!v.currentPassword) e.currentPassword = 'Enter your current password.';
    if (v.newPassword.length < 8) e.newPassword = 'Use at least 8 characters.';
    if (v.confirm !== v.newPassword) e.confirm = 'Passwords do not match.';
    return e;
  };
  return (
    <Card title="Change password" description="You stay signed in on this device; other sessions end.">
      <form noValidate className="form-grid" onSubmit={e => { e.preventDefault(); run(validate, () => api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }), { onDone: () => f.reset() }); }}>
        <Input label="Current password" type="password" required autoComplete="current-password" wrapperClass="span-2" {...f.input('currentPassword')} error={errors.currentPassword} />
        <Input label="New password" type="password" required autoComplete="new-password" {...f.input('newPassword')} error={errors.newPassword} />
        <Input label="Confirm new password" type="password" required autoComplete="new-password" {...f.input('confirm')} error={errors.confirm} />
        <div className="form-actions span-2"><Button type="submit" variant="primary" loading={busy}>Update password</Button></div>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const formId = useId();
  const fileRef = useRef(null);
  const initial = { name: user.name, contact: user.contact || '', department: user.department || '', startupName: user.startupName || '' };
  const f = useFields(initial);
  const [photoBusy, setPhotoBusy] = useState(false);
  const { busy, errors, run } = useSubmit();
  const dirty = Object.keys(initial).some(k => (f.values[k] || '') !== (initial[k] || ''));

  const onPhoto = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Choose a JPG, PNG or WebP image.'); return; }
    if (file.size > MAX_PHOTO) { toast.error('Photo must be 5 MB or smaller.'); return; }
    setPhotoBusy(true);
    try { const res = await api.upload('/users/me/photo', 'photo', file); setUser(u => ({ ...u, ...(res.data?.profilePhoto ? { profilePhoto: res.data.profilePhoto } : res.data) })); toast.success('Profile photo updated.'); } catch (err) { toast.error(toUserMessage(err)); } finally { setPhotoBusy(false); }
  };
  const validate = () => (f.values.name.trim().length >= 2 ? {} : { name: 'Enter a name with at least 2 characters.' });
  const save = e => {
    e.preventDefault();
    const body = {};
    Object.keys(initial).forEach(k => { if (f.values[k] !== initial[k]) body[k] = f.values[k].trim(); });
    run(validate, () => api.patch('/users/me/profile', body), { success: 'Profile updated.', onDone: d => setUser(u => ({ ...u, ...(d || body) })) });
  };

  return (
    <div className="page">
      <PageHeader title="Profile" description="Your details appear in approvals, bookings and the directory." />
      <div className="profile-layout">
        <Card title="Photo & account">
          <div className="profile-card">
            <Avatar name={user.name} src={user.profilePhoto?.url} size={96} />
            <div className="profile-card__actions">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPhoto} aria-label="Upload profile photo" tabIndex={-1} />
              <Button size="sm" icon={Camera} loading={photoBusy} onClick={() => fileRef.current?.click()}>Upload photo</Button>
            </div>
            <dl className="detail-list detail-list--single">
              <div><dt>Role</dt><dd><Badge tone="blue" dot={false}>{ROLE_LABELS[user.role]}</Badge></dd></div>
              <div><dt>Account status</dt><dd><Badge status={user.status} /></dd></div>
              <div><dt>Joined</dt><dd>{fmtDate(user.createdAt)}</dd></div>
              <div><dt>Last sign-in</dt><dd>{user.lastLogin ? fmtDateTime(user.lastLogin) : '—'}</dd></div>
            </dl>
            <p className="muted">{ROLE_DESCRIPTIONS[user.role]}</p>
          </div>
        </Card>
        <div className="stack">
          <Card title="Personal details">
            <form id={formId} noValidate className="form-grid" onSubmit={save}>
              <Input label="Full name" required {...f.input('name')} error={errors.name} autoComplete="name" />
              <Input label="Email" value={user.email} readOnly disabled hint="Email cannot be changed." />
              <Input label="Contact number" type="tel" {...f.input('contact')} error={errors.contact} autoComplete="tel" />
              <Input label="Department" {...f.input('department')} error={errors.department} />
              {user.role === 'FOUNDER' && <Input label="Startup name" wrapperClass="span-2" {...f.input('startupName')} error={errors.startupName} />}
              <div className="form-actions span-2">
                <Button onClick={f.reset} disabled={!dirty || busy}>Reset</Button>
                <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>Save changes</Button>
              </div>
            </form>
          </Card>
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}
