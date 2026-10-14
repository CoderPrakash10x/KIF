const app = require('./app');
const mongoose = require('mongoose');
const { connectDB } = require('./config/database');
const { initJobs } = require('./jobs');

const PORT = process.env.PORT || 5001;

connectDB().then(() => {
  initJobs();

  const server = app.listen(PORT, () => console.log(`KIF-RMS server running on port ${PORT}`));
  server.keepAliveTimeout = 65000; // above typical load-balancer idle timeouts
  server.headersTimeout = 66000;
  server.requestTimeout = 60000;

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received: draining connections`);
    server.close(async () => {
      await mongoose.connection.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));
});

process.on('unhandledRejection', (reason) => { console.error('UNHANDLED_REJECTION:', reason); });
process.on('uncaughtException', (err) => { console.error('UNCAUGHT_EXCEPTION:', err); process.exit(1); });
