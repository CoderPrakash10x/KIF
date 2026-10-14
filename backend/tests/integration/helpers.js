// Integration test harness: in-memory MongoDB *replica set* (the app uses transactions) + the real Express app.
// NOT executed in the environment this was authored in (no npm registry / MongoDB); run with `npm run test:integration`.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let replset;
exports.start = async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: replset.getUri(), JWT_SECRET: 'test-jwt-secret-0123456789', JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
    SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASSWORD: 'p', FRONTEND_URL: 'http://localhost:5173', OTP_RESEND_COOLDOWN_SECONDS: '60', OTP_MAX_ATTEMPTS: '3',
  });
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
};
exports.stop = async () => { await mongoose.disconnect(); await replset.stop(); };
exports.reset = async () => { await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))); };

// The mailer is mocked; the code is read back from the e-mail body exactly as a person would.
exports.sentCodes = () => require('../../src/utils/email').sendEmail.mock.calls.map(([m]) => (m.html.match(/>(\d{6})</) || [])[1]).filter(Boolean);
exports.registration = (over = {}) => ({
  name: 'Asha Verma', college: 'KIPM - College of Management', department: 'Management', branch: 'MBA', rollNumber: '21-MBA-007',
  email: 'asha@example.com', password: 'S3curePass!', role: 'STUDENT', ...over,
});
