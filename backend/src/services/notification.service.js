const { Notification, User } = require('../models');
const { ROLES, USER_STATUS } = require('../constants/enums');
const ApiError = require('../utils/ApiError');
const { sendEmail } = require('../utils/email');

const MAX_EMAIL_ATTEMPTS = 3;

function genericNotificationTemplate(name, title, message) {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#0F172A;">${title}</h2>
      <p style="color:#1E293B;">Hi ${name},</p>
      <p style="color:#1E293B;">${message}</p>
      <p style="color:#64748B;font-size:12px;margin-top:24px;">— KIF Resource Management System</p>
    </div>`;
}

// Best-effort email delivery. Never throws: email problems must not break business flows.
async function deliverEmail(notificationId) {
  try {
    const n = await Notification.findById(notificationId);
    if (!n || n.emailSent || n.emailAttempts >= MAX_EMAIL_ATTEMPTS) return false;
    const user = await User.findById(n.userId).select('name email');
    if (!user) return false;
    n.emailAttempts += 1;
    const ok = await sendEmail({
      to: user.email,
      subject: n.title,
      html: genericNotificationTemplate(user.name, n.title, n.message),
    });
    if (ok) { n.emailSent = true; n.emailSentAt = new Date(); }
    await n.save();
    return ok;
  } catch (err) {
    console.error('NOTIFICATION_EMAIL_FAILURE:', err.message);
    return false;
  }
}

// In-app notification (+ asynchronous email). Failures are logged, never thrown.
async function notify({ userId, type, title, message, relatedResourceType, relatedResourceId, email = true }) {
  try {
    if (!userId) return null;
    const n = await Notification.create({
      userId, type, title, message, relatedResourceType, relatedResourceId,
      emailSent: !email, // in-app only notifications are never retried
    });
    if (email) setImmediate(() => { deliverEmail(n._id); });
    return n;
  } catch (err) {
    console.error('NOTIFY_FAILURE:', err.message);
    return null;
  }
}

// In-app notification for every active Admin / Super Admin (no email, to avoid inbox floods).
async function notifyAdmins({ type, title, message, relatedResourceType, relatedResourceId }) {
  try {
    const admins = await User.find({
      role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] }, status: USER_STATUS.ACTIVE,
    }).select('_id');
    if (!admins.length) return [];
    return await Notification.insertMany(
      admins.map((a) => ({
        userId: a._id, type, title, message, relatedResourceType, relatedResourceId, emailSent: true,
      })),
    );
  } catch (err) {
    console.error('NOTIFY_ADMINS_FAILURE:', err.message);
    return [];
  }
}

async function notifySuperAdmins({ type, title, message, relatedResourceType, relatedResourceId }) {
  try {
    const admins = await User.find({ role: ROLES.SUPER_ADMIN, status: USER_STATUS.ACTIVE }).select('_id');
    if (!admins.length) return [];
    return await Notification.insertMany(admins.map((a) => ({ userId: a._id, type, title, message, relatedResourceType, relatedResourceId, emailSent: true })));
  } catch (err) {
    console.error('NOTIFY_SUPER_ADMINS_FAILURE:', err.message);
    return [];
  }
}

async function retryEmailDelivery(notificationId) {
  return deliverEmail(notificationId);
}

// ---- Read API (per-user inbox) ----
async function listForUser(userId, { read, type, page = 1, limit = 20 } = {}) {
  const query = { userId };
  if (read === 'true' || read === true) query.read = true;
  if (read === 'false' || read === false) query.read = false;
  if (type) query.type = type;
  const skip = (page - 1) * limit;
  const [data, total, unread] = await Promise.all([
    Notification.find(query).select('-emailAttempts -emailSent -emailSentAt').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ userId, read: false }),
  ]);
  return { data, unread, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function unreadCount(userId) {
  return Notification.countDocuments({ userId, read: false });
}

async function markRead(userId, notificationId, read = true) {
  const n = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { read, readAt: read ? new Date() : null },
    { new: true },
  );
  if (!n) throw new ApiError(404, 'Notification not found', 'NOT_FOUND');
  return n;
}

async function markAllRead(userId) {
  const res = await Notification.updateMany({ userId, read: false }, { read: true, readAt: new Date() });
  return { modified: res.modifiedCount };
}

module.exports = {
  MAX_EMAIL_ATTEMPTS,
  genericNotificationTemplate,
  notify,
  notifyAdmins,
  notifySuperAdmins,
  retryEmailDelivery,
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
};
