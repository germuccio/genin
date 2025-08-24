import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { z } from 'zod';

// Temporary inline schema until we fix the shared import
const ExcelRowSchema = z.object({
  referanse: z.string().min(1),
  transportid: z.string().optional(),
  avsender: z.string().optional(),
  mottaker: z.string().optional(),
  sekvensnr: z.string().min(1),
  status_code: z.enum(['OK','MAN','OTHER']).or(z.string()), // adapt as needed
  total_br_vket: z.preprocess((v) => typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v, z.number().optional()),
  currency: z.string().optional(),
});

type ExcelRow = z.infer<typeof ExcelRowSchema>;
import { db } from '../db/database.js';

export interface ParsedExcelResult {
  importId: number;
  totalRows: number;
  validRows: number;
  errors: string[];
}

export class ExcelParserService {
  /**
   * Parse Excel file and store rows in database
   */
  async parseExcelFile(
    fileBuffer: Buffer,
    filename: string
  ): Promise<ParsedExcelResult> {
    try {
      // Generate file checksum
      const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');

      // Check if file was already processed
      const existingImport = await db
        .selectFrom('imports')
        .select(['id', 'status'])
        .where('checksum', '=', checksum)
        .executeTakeFirst();

      if (existingImport) {
        throw new Error(`File already processed with import ID: ${existingImport.id}`);
      }

      // Create import record
      const importResult = await db
        .insertInto('imports')
        .values({
          filename,
          checksum,
          status: 'processing',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const importId = importResult.id;

      try {
        // Parse Excel file
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        
        if (!sheetName) {
          throw new Error('No sheets found in Excel file');
        }

        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
        }) as any[][];

        if (rawData.length === 0) {
          throw new Error('No data found in Excel file');
        }

        // Assume first row contains headers
        const headers = rawData[0] as string[];
        const dataRows = rawData.slice(1);

        const errors: string[] = [];
        let validRows = 0;

        // Process each data row
        for (let i = 0; i < dataRows.length; i++) {
          const rowData = dataRows[i];
          const rowIndex = i + 2; // +2 because of 0-based index and header row

          try {
            // Convert array to object using headers
            const rowObject = this.arrayToObject(headers, rowData);
            
            // Validate with Zod schema
            const validatedRow = ExcelRowSchema.parse(rowObject);
            
            // Generate unique hash for this row
            const rowHash = crypto
              .createHash('md5')
              .update(JSON.stringify(validatedRow))
              .digest('hex');

            // Store validated row in database
            await db
              .insertInto('import_rows')
              .values({
                import_id: importId,
                row_index: rowIndex,
                referanse: validatedRow.referanse,
                transportid: validatedRow.transportid,
                avsender: validatedRow.avsender,
                mottaker: validatedRow.mottaker,
                sekvensnr: validatedRow.sekvensnr,
                status_code: validatedRow.status_code,
                parsed_json: rowObject,
                hash: rowHash,
                processed: false,
              })
              .execute();

            validRows++;
          } catch (error) {
            const errorMessage = `Row ${rowIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMessage);
            console.warn(errorMessage);
          }
        }

        // Update import status
        await db
          .updateTable('imports')
          .set({
            status: errors.length === dataRows.length ? 'failed' : 'completed',
          })
          .where('id', '=', importId)
          .execute();

        return {
          importId,
          totalRows: dataRows.length,
          validRows,
          errors,
        };
      } catch (error) {
        // Mark import as failed
        await db
          .updateTable('imports')
          .set({ status: 'failed' })
          .where('id', '=', importId)
          .execute();

        throw error;
      }
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert array of values to object using headers
   */
  private arrayToObject(headers: string[], values: any[]): Record<string, any> {
    const obj: Record<string, any> = {};
    
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]?.toString().trim();
      const value = values[i];
      
      if (header) {
        // Clean up header name and convert to camelCase or match expected schema fields
        const cleanHeader = this.normalizeHeaderName(header);
        obj[cleanHeader] = value === '' ? undefined : value;
      }
    }
    
    return obj;
  }

  /**
   * Normalize header names to match expected schema fields
   */
  private normalizeHeaderName(header: string): string {
    const headerMap: Record<string, string> = {
      'referanse': 'referanse',
      'reference': 'referanse',
      'transportid': 'transportid',
      'transport_id': 'transportid',
      'avsender': 'avsender',
      'sender': 'avsender',
      'mottaker': 'mottaker',
      'receiver': 'mottaker',
      'sekvensnr': 'sekvensnr',
      'sequence_number': 'sekvensnr',
      'sekvens_nr': 'sekvensnr',
      'status_code': 'status_code',
      'statuscode': 'status_code',
      'status': 'status_code',
      'total_br_vekt': 'total_br_vket',
      'total_brutto_vekt': 'total_br_vket',
      'currency': 'currency',
      'valuta': 'currency',
    };

    const normalized = header.toLowerCase().replace(/\s+/g, '_');
    return headerMap[normalized] || normalized;
  }

  /**
   * Get import details with row counts
   */
  async getImportDetails(importId: number) {
    const importRecord = await db
      .selectFrom('imports')
      .selectAll()
      .where('id', '=', importId)
      .executeTakeFirst();

    if (!importRecord) {
      throw new Error(`Import with ID ${importId} not found`);
    }

    const rowCounts = await db
      .selectFrom('import_rows')
      .select([
        (eb) => eb.fn.count('id').as('total_rows'),
        (eb) => eb.fn.sum(eb.case().when('processed', '=', true).then(1).else(0).end()).as('processed_rows'),
      ])
      .where('import_id', '=', importId)
      .executeTakeFirst();

    return {
      ...importRecord,
      total_rows: Number(rowCounts?.total_rows || 0),
      processed_rows: Number(rowCounts?.processed_rows || 0),
    };
  }

  /**
   * Get unprocessed rows for an import
   */
  async getUnprocessedRows(importId: number) {
    return db
      .selectFrom('import_rows')
      .selectAll()
      .where('import_id', '=', importId)
      .where('processed', '=', false)
      .orderBy('row_index', 'asc')
      .execute();
  }
}

