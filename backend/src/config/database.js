const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDB() {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    return mongoose.connection;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };