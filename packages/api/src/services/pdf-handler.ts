import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
// import pdfParse from 'pdf-parse'; // Temporarily disabled due to package issues

export interface StoredPdfFile {
  originalName: string;
  storedPath: string;
  checksum: string;
  size: number;
  extractedText?: string;
}

export class PdfHandlerService {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.ensureUploadDir();
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(path.join(this.uploadDir, 'pdfs'), { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directory:', error);
      throw new Error('Failed to initialize PDF storage');
    }
  }

  /**
   * Store PDF file and extract text content
   */
  async storePdfFile(
    fileBuffer: Buffer,
    originalName: string
  ): Promise<StoredPdfFile> {
    try {
      // Generate checksum
      const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');
      
      // Generate unique filename
      const timestamp = Date.now();
      const ext = path.extname(originalName);
      const baseName = path.basename(originalName, ext);
      const storedFileName = `${baseName}_${timestamp}_${checksum.slice(0, 8)}${ext}`;
      const storedPath = path.join(this.uploadDir, 'pdfs', storedFileName);

      // Store file
      await fs.writeFile(storedPath, fileBuffer);

      // Extract text content - temporarily disabled
      let extractedText: string | undefined;
      // TODO: Re-enable PDF text extraction with a working library
      console.log('PDF text extraction temporarily disabled');

      const result: StoredPdfFile = {
        originalName,
        storedPath,
        checksum,
        size: fileBuffer.length,
      };
      
      if (extractedText) {
        result.extractedText = extractedText;
      }
      
      return result;
    } catch (error) {
      console.error('Error storing PDF file:', error);
      throw new Error(`Failed to store PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve PDF file
   */
  async retrievePdfFile(storedPath: string): Promise<Buffer> {
    try {
      return await fs.readFile(storedPath);
    } catch (error) {
      console.error('Error retrieving PDF file:', error);
      throw new Error(`Failed to retrieve PDF file: ${storedPath}`);
    }
  }

  /**
   * Delete PDF file
   */
  async deletePdfFile(storedPath: string): Promise<void> {
    try {
      await fs.unlink(storedPath);
    } catch (error) {
      console.warn('Error deleting PDF file:', error);
      // Don't throw error if file doesn't exist
    }
  }

  /**
   * Check if PDF file exists
   */
  async pdfFileExists(storedPath: string): Promise<boolean> {
    try {
      await fs.access(storedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get PDF file info
   */
  async getPdfFileInfo(storedPath: string): Promise<{ size: number; mtime: Date } | null> {
    try {
      const stats = await fs.stat(storedPath);
      return {
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Validate PDF file
   */
  validatePdfFile(fileBuffer: Buffer): { isValid: boolean; error?: string } {
    // Check minimum size
    if (fileBuffer.length < 1024) {
      return { isValid: false, error: 'File too small to be a valid PDF' };
    }

    // Check PDF header
    const header = fileBuffer.subarray(0, 5).toString();
    if (!header.startsWith('%PDF-')) {
      return { isValid: false, error: 'Invalid PDF header' };
    }

    // Check maximum size (10MB)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760');
    if (fileBuffer.length > maxSize) {
      return { isValid: false, error: `File size exceeds maximum allowed size of ${maxSize} bytes` };
    }

    return { isValid: true };
  }

  /**
   * Search for keywords in PDF text
   */
  searchInPdfText(text: string, keywords: string[]): string[] {
    const foundKeywords: string[] = [];
    const lowerText = text.toLowerCase();

    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
      }
    }

    return foundKeywords;
  }

  /**
   * Extract metadata from PDF text
   */
  extractMetadata(text: string): Record<string, any> {
    const metadata: Record<string, any> = {};

    // Common patterns for Norwegian shipping documents
    const patterns = {
      referanse: /(?:ref(?:erans)?[:\s]+)([A-Z0-9\-]+)/i,
      transportId: /(?:transport[:\s]+)([A-Z0-9\-]+)/i,
      dato: /(?:dato[:\s]+)(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4})/i,
      vekt: /(?:vekt[:\s]+)(\d+(?:[.,]\d+)?)\s*(?:kg)?/i,
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        metadata[key] = match[1].trim();
      }
    }

    return metadata;
  }

  /**
   * Clean up old PDF files
   */
  async cleanupOldFiles(daysOld: number = 30): Promise<number> {
    try {
      const pdfDir = path.join(this.uploadDir, 'pdfs');
      const files = await fs.readdir(pdfDir);
      let deletedCount = 0;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      for (const file of files) {
        const filePath = path.join(pdfDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old PDF files:', error);
      return 0;
    }
  }
}

