const { z } = require('zod');
const { ROLES } = require('../constants/enums');

// Explicitly excludes ADMIN/SUPER_ADMIN from self-signup — server-side enforced, not just UI.
const SELF_SIGNUP_ROLES = [ROLES.FOUNDER, ROLES.INTERN, ROLES.STUDENT];

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
  role: z.enum(SELF_SIGNUP_ROLES),
  contact: z.string().trim().max(30).optional(),
  department: z.string().trim().max(100).optional(),
  startupName: z.string().trim().max(150).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(8).max(72),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  contact: z.string().trim().max(30).optional(),
  department: z.string().trim().max(100).optional(),
  startupName: z.string().trim().max(150).optional(),
});

const assignRoleSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId'),
  role: z.enum(Object.values(ROLES)),
});

module.exports = {
  registerSchema, loginSchema, forgotPasswordSchema,
  resetPasswordSchema, changePasswordSchema, updateProfileSchema, assignRoleSchema,
};