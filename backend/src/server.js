const app = require('./app');
const { connectDB } = require('./config/database');
const { initJobs } = require('./jobs');

const PORT = process.env.PORT || 5001;

connectDB().then(() => {
  // Start background jobs after successful database connection
  initJobs();

  app.listen(PORT, () => {
    console.log(`🚀 KIF-RMS Server running on port ${PORT}`);
  });
});