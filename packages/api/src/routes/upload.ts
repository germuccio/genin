import { Router } from 'express';
import { uploadFields } from '../middleware/upload.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { ExcelParserService } from '../services/excel-parser.js';
import { PdfHandlerService } from '../services/pdf-handler.js';

const router = Router();
const excelParser = new ExcelParserService();
const pdfHandler = new PdfHandlerService();

/**
 * POST /upload/files
 * Upload Excel and PDF files
 */
router.post('/files', uploadFields, asyncHandler(async (req, res) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  if (!files.excel || files.excel.length === 0) {
    return res.status(400).json({
      error: 'Excel file is required',
    });
  }

  const excelFile = files.excel[0];
  const pdfFiles = files.pdf || [];

  try {
    // Parse Excel file
    const parseResult = await excelParser.parseExcelFile(
      excelFile.buffer,
      excelFile.originalname
    );

    // Store PDF files if provided
    const storedPdfs = [];
    for (const pdfFile of pdfFiles) {
      // Validate PDF file
      const validation = pdfHandler.validatePdfFile(pdfFile.buffer);
      if (!validation.isValid) {
        console.warn(`Invalid PDF file ${pdfFile.originalname}: ${validation.error}`);
        continue;
      }

      const storedPdf = await pdfHandler.storePdfFile(
        pdfFile.buffer,
        pdfFile.originalname
      );
      storedPdfs.push({
        originalName: storedPdf.originalName,
        size: storedPdf.size,
        hasText: !!storedPdf.extractedText,
      });
    }

    res.json({
      import_id: parseResult.importId,
      filename: excelFile.originalname,
      status: 'completed',
      total_rows: parseResult.totalRows,
      valid_rows: parseResult.validRows,
      errors: parseResult.errors,
      pdf_files: storedPdfs,
    });
  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process upload',
    });
  }
}));

/**
 * GET /upload/imports
 * Get all imports
 */
router.get('/imports', asyncHandler(async (req, res) => {
  const imports = await excelParser.getImportDetails(Number(req.query.id));
  res.json(imports);
}));

/**
 * GET /upload/imports/:id
 * Get import details
 */
router.get('/imports/:id', asyncHandler(async (req, res) => {
  const importId = parseInt(req.params.id);
  
  if (isNaN(importId)) {
    return res.status(400).json({
      error: 'Invalid import ID',
    });
  }

  const importDetails = await excelParser.getImportDetails(importId);
  res.json(importDetails);
}));

/**
 * GET /upload/imports/:id/rows
 * Get import rows
 */
router.get('/imports/:id/rows', asyncHandler(async (req, res) => {
  const importId = parseInt(req.params.id);
  
  if (isNaN(importId)) {
    return res.status(400).json({
      error: 'Invalid import ID',
    });
  }

  const unprocessedOnly = req.query.unprocessed === 'true';
  
  if (unprocessedOnly) {
    const rows = await excelParser.getUnprocessedRows(importId);
    res.json(rows);
  } else {
    // Get all rows for this import
    const rows = await excelParser.getUnprocessedRows(importId); // TODO: Add method to get all rows
    res.json(rows);
  }
}));

export default router;



