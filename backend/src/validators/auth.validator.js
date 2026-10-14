const { z } = require('zod');
const { ROLES } = require('../constants/enums');

// Explicitly excludes ADMIN/SUPER_ADMIN from self-signup — server-side enforced, not just UI.
const SELF_SIGNUP_ROLES = [ROLES.FOUNDER, ROLES.INTERN, ROLES.STUDENT];

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(SELF_SIGNUP_ROLES),
  contact: z.string().optional(),
  department: z.string().optional(),
  startupName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  contact: z.string().optional(),
  department: z.string().optional(),
  startupName: z.string().optional(),
});

const assignRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(Object.values(ROLES)),
});

module.exports = {
  registerSchema, loginSchema, forgotPasswordSchema,
  resetPasswordSchema, changePasswordSchema, updateProfileSchema, assignRoleSchema,
};