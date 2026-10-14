// Role model for the UI. Backend RBAC (middleware/role.js + service guards) is the real security
// layer; this file only decides what each role is SHOWN and which area it lands in.
export const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', FOUNDER: 'FOUNDER', INTERN: 'INTERN', STUDENT: 'STUDENT' };
export const ALL_ROLES = Object.values(ROLES);

export const ROLE_LABELS = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', FOUNDER: 'Founder', INTERN: 'Intern', STUDENT: 'Student' };
export const ROLE_DESCRIPTIONS = {
  SUPER_ADMIN: 'Full system access: users and roles, every resource module, audit trail and analytics.',
  ADMIN: 'Manages resources, requests, bookings, events and inventory. Cannot touch Admin / Super Admin accounts.',
  FOUNDER: 'Workspace for your startup: own requests, bookings, events and profile.',
  INTERN: 'Personal workspace: own requests, bookings, events and profile.',
  STUDENT: 'Personal workspace: own requests, bookings, events and profile.',
};

// One React app, role-based areas: /admin/*, /founder/*, /intern/*, /student/*
export const ROLE_AREA = { SUPER_ADMIN: 'admin', ADMIN: 'admin', FOUNDER: 'founder', INTERN: 'intern', STUDENT: 'student' };
export const AREAS = ['admin', 'founder', 'intern', 'student'];
export const areaOf = role => ROLE_AREA[role] || null;
export const basePath = role => `/${areaOf(role)}`;
export const homePath = role => (areaOf(role) ? `/${areaOf(role)}/dashboard` : '/login');
export const isAdminRole = role => role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
export const isMemberRole = role => !!role && !isAdminRole(role);

export const PERMISSIONS = {
  USER_VIEW: 'USER_VIEW', USER_STATUS: 'USER_STATUS', USER_ROLE: 'USER_ROLE', USER_ELEVATED: 'USER_ELEVATED', ROLE_MATRIX: 'ROLE_MATRIX',
  CABIN_MANAGE: 'CABIN_MANAGE', HARDWARE_MANAGE: 'HARDWARE_MANAGE', ROOM_MANAGE: 'ROOM_MANAGE', CONSUMABLE_MANAGE: 'CONSUMABLE_MANAGE',
  REQUEST_APPROVE: 'REQUEST_APPROVE', EVENT_MANAGE: 'EVENT_MANAGE', ANALYTICS_VIEW: 'ANALYTICS_VIEW',
  AUDIT_VIEW: 'AUDIT_VIEW', AUDIT_FULL: 'AUDIT_FULL', REQUEST_CREATE: 'REQUEST_CREATE', ROOM_BOOK: 'ROOM_BOOK', EVENT_RSVP: 'EVENT_RSVP',
};
const P = PERMISSIONS;
const ADMIN_COMMON = [
  P.USER_VIEW, P.USER_STATUS, P.USER_ROLE, P.CABIN_MANAGE, P.HARDWARE_MANAGE, P.ROOM_MANAGE, P.CONSUMABLE_MANAGE,
  P.REQUEST_APPROVE, P.EVENT_MANAGE, P.ANALYTICS_VIEW, P.AUDIT_VIEW, P.EVENT_RSVP,
];
const MEMBER = [P.REQUEST_CREATE, P.ROOM_BOOK, P.EVENT_RSVP];
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [...ADMIN_COMMON, P.USER_ELEVATED, P.ROLE_MATRIX, P.AUDIT_FULL],
  ADMIN: ADMIN_COMMON,
  FOUNDER: MEMBER, INTERN: MEMBER, STUDENT: MEMBER,
};
export const hasPermission = (role, permission) => !!role && (ROLE_PERMISSIONS[role] || []).includes(permission);

// Mirrors services/user.service.js: only Super Admin may touch Admin / Super Admin accounts.
export const canManageUser = (actor, target) => {
  if (!actor || !target || actor._id === target._id) return false;
  if (actor.role === ROLES.SUPER_ADMIN) return true;
  if (actor.role === ROLES.ADMIN) return isMemberRole(target.role);
  return false;
};
