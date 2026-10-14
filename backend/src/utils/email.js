const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: Number(env.SMTP_PORT) === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
});

async function sendEmail({ to, subject, html, attachments }) {
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM || `"KIF Resource Management" <${env.SMTP_USER}>`,
      to, subject, html, attachments,
    });
    return true;
  } catch (err) {
    console.error('EMAIL_SEND_FAILURE:', err.message);
    return false; // Never throw — email failure must not break the calling business flow.
  }
}

function genericNotificationTemplate(name, title, message) {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#0F172A;">${title}</h2>
      <p style="color:#1E293B;">Hi ${name},</p>
      <p style="color:#1E293B;">${message}</p>
      <p style="color:#64748B;font-size:12px;margin-top:24px;">— KIF Resource Management System</p>
    </div>`;
}

function otpEmailTemplate(name, otp, expiresInMinutes) {
  const safe = String(name).replace(/[<>&"]/g, '');
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#0F172A;">Verify your email, ${safe}</h2>
      <p style="color:#1E293B;">Use this code to verify your KIF-RMS registration:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#0b8374;margin:16px 0;">${otp}</p>
      <p style="color:#1E293B;">It expires in ${expiresInMinutes} minutes and can be used once.</p>
      <p style="color:#64748B;font-size:12px;margin-top:24px;">If you did not request this, you can ignore this email. Never share this code with anyone.
      After verification, a Super Admin still needs to approve your account.</p>
    </div>`;
}

module.exports = {
  otpEmailTemplate, sendEmail, verificationEmailTemplate, passwordResetEmailTemplate,
  genericNotificationTemplate, // add to existing exports
};

function verificationEmailTemplate(name, verifyUrl) {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#0F172A;">Welcome to KIF-RMS, ${name} 👋</h2>
      <p style="color:#1E293B;">Please verify your email address to activate your account.</p>
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563EB;
         color:white;text-decoration:none;border-radius:8px;margin-top:12px;">Verify Email</a>
      <p style="color:#64748B;font-size:12px;margin-top:24px;">This link expires in 24 hours.</p>
    </div>`;
}

function passwordResetEmailTemplate(name, resetUrl) {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: auto;">
      <h2 style="color:#0F172A;">Password Reset Request</h2>
      <p style="color:#1E293B;">Hi ${name}, click below to reset your KIF-RMS password.</p>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#DC2626;
         color:white;text-decoration:none;border-radius:8px;margin-top:12px;">Reset Password</a>
      <p style="color:#64748B;font-size:12px;margin-top:24px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>`;
}


module.exports = {
  otpEmailTemplate,
  sendEmail,
  verificationEmailTemplate,
  passwordResetEmailTemplate,
  genericNotificationTemplate,
};
