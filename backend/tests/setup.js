process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/test';
process.env.JWT_SECRET = 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
process.env.SMTP_HOST = 'localhost'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASSWORD = 'p';
process.env.FRONTEND_URL = 'http://localhost:5173';
