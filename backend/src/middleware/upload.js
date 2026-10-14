const multer = require('multer');

// Memory storage — files go straight to Cloudinary/CSV-parser without hitting disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = {
    csv: ['text/csv', 'application/vnd.ms-excel'],
    image: ['image/jpeg', 'image/png', 'image/webp'],
    document: ['application/pdf'],
  };
  const allAllowed = Object.values(allowedMimes).flat();
  if (allAllowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — per Section 23 file size limits
});

module.exports = { upload };