import multer from 'multer';
import path from 'path';

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['.xlsx', '.xls', '.pdf'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${fileExt} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
});

export const uploadFields = upload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'pdf', maxCount: 10 }, // Allow multiple PDFs
]);



