import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { ExcelParserService } from '../services/excel-parser.js'

// Mock dependencies
vi.mock('../db/database.js', () => ({
  db: {
    selectFrom: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    executeTakeFirstOrThrow: vi.fn(),
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  }
}))

describe('ExcelParserService', () => {
  let excelParser: ExcelParserService

  beforeEach(() => {
    excelParser = new ExcelParserService()
    vi.clearAllMocks()
  })

  describe('parseExcelFile', () => {
    it('should parse valid Excel file successfully', async () => {
      // Create a mock Excel buffer
      const mockWorkbook = XLSX.utils.book_new()
      const mockData = [
        ['referanse', 'transportid', 'avsender', 'mottaker', 'sekvensnr', 'status_code'],
        ['REF001', 'TR001', 'Sender A', 'Receiver B', 'SEQ001', 'OK'],
        ['REF002', 'TR002', 'Sender C', 'Receiver D', 'SEQ002', 'MAN']
      ]
      const mockWorksheet = XLSX.utils.aoa_to_sheet(mockData)
      XLSX.utils.book_append_sheet(mockWorkbook, mockWorksheet, 'Sheet1')
      const buffer = XLSX.write(mockWorkbook, { type: 'buffer', bookType: 'xlsx' })

      // Mock database responses
      const { db } = await import('../db/database.js')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(null) // No existing import
      vi.mocked(db.executeTakeFirstOrThrow).mockResolvedValue({ id: 1 }) // New import created
      vi.mocked(db.execute).mockResolvedValue([]) // Insert row operations

      const result = await excelParser.parseExcelFile(buffer, 'test.xlsx')

      expect(result).toMatchObject({
        importId: 1,
        totalRows: 2,
        validRows: expect.any(Number),
        errors: expect.any(Array)
      })
    })

    it('should handle duplicate file upload', async () => {
      const mockWorkbook = XLSX.utils.book_new()
      const mockData = [['referanse'], ['REF001']]
      const mockWorksheet = XLSX.utils.aoa_to_sheet(mockData)
      XLSX.utils.book_append_sheet(mockWorkbook, mockWorksheet, 'Sheet1')
      const buffer = XLSX.write(mockWorkbook, { type: 'buffer', bookType: 'xlsx' })

      // Mock existing import
      const { db } = await import('../db/database.js')
      vi.mocked(db.executeTakeFirst).mockResolvedValue({ id: 1, status: 'completed' })

      await expect(
        excelParser.parseExcelFile(buffer, 'test.xlsx')
      ).rejects.toThrow('File already processed with import ID: 1')
    })

    it('should handle empty Excel file', async () => {
      const mockWorkbook = XLSX.utils.book_new()
      const mockWorksheet = XLSX.utils.aoa_to_sheet([])
      XLSX.utils.book_append_sheet(mockWorkbook, mockWorksheet, 'Sheet1')
      const buffer = XLSX.write(mockWorkbook, { type: 'buffer', bookType: 'xlsx' })

      const { db } = await import('../db/database.js')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(null)
      vi.mocked(db.executeTakeFirstOrThrow).mockResolvedValue({ id: 1 })

      await expect(
        excelParser.parseExcelFile(buffer, 'empty.xlsx')
      ).rejects.toThrow('No data found in Excel file')
    })
  })

  describe('normalizeHeaderName', () => {
    it('should normalize common header variations', () => {
      const testCases = [
        ['Referanse', 'referanse'],
        ['TRANSPORT_ID', 'transportid'],
        ['Transport ID', 'transportid'],
        ['Status Code', 'status_code'],
        ['Total Br Vekt', 'total_br_vket']
      ]

      testCases.forEach(([input, expected]) => {
        // Access the private method through any type assertion
        const result = (excelParser as any).normalizeHeaderName(input)
        expect(result).toBe(expected)
      })
    })
  })

  describe('arrayToObject', () => {
    it('should convert array to object using headers', () => {
      const headers = ['referanse', 'transportid', 'status_code']
      const values = ['REF001', 'TR001', 'OK']

      const result = (excelParser as any).arrayToObject(headers, values)

      expect(result).toEqual({
        referanse: 'REF001',
        transportid: 'TR001',
        status_code: 'OK'
      })
    })

    it('should handle empty values as undefined', () => {
      const headers = ['referanse', 'transportid']
      const values = ['REF001', '']

      const result = (excelParser as any).arrayToObject(headers, values)

      expect(result).toEqual({
        referanse: 'REF001',
        transportid: undefined
      })
    })
  })
})



