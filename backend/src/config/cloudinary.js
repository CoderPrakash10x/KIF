// Cloudinary is optional. When it is not configured, photo uploads fail with a clear 503
// instead of crashing (the rest of the API is unaffected).
const ApiError = require('../utils/ApiError');

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
const configured = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

let cloudinary;
if (configured) {
  // eslint-disable-next-line global-require
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true,
  });
} else {
  const unavailable = () => { throw new ApiError(503, 'Photo uploads are not configured on this server', 'UPLOADS_UNAVAILABLE'); };
  cloudinary = { uploader: { upload_stream: unavailable, destroy: async () => ({}) } };
}

module.exports = cloudinary;
