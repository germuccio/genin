import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import cors from 'cors'
import authRoutes from '../routes/auth.js'
import uploadRoutes from '../routes/upload.js'
import invoiceRoutes from '../routes/invoices.js'

// Mock all services
vi.mock('../services/visma-auth.js')
vi.mock('../services/visma-api.js')
vi.mock('../services/excel-parser.js')
vi.mock('../services/pricing-service.js')
vi.mock('../db/database.js')

// Create test app
function createTestApp() {
  const app = express()
  
  app.use(cors())
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  
  app.use('/api/auth', authRoutes)
  app.use('/api/upload', uploadRoutes)
  app.use('/api/invoices', invoiceRoutes)
  
  return app
}

describe('API Routes', () => {
  let app: express.Application

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  describe('Auth Routes', () => {
    describe('GET /api/auth/visma/url', () => {
      it('should return authorization URL', async () => {
        const { VismaAuthService } = await import('../services/visma-auth.js')
        const mockAuthService = {
          getAuthorizationUrl: vi.fn().mockReturnValue('https://auth.url')
        }
        vi.mocked(VismaAuthService).mockImplementation(() => mockAuthService as any)

        const response = await request(app)
          .get('/api/auth/visma/url')
          .expect(200)

        expect(response.body).toHaveProperty('auth_url')
        expect(response.body).toHaveProperty('state')
        expect(mockAuthService.getAuthorizationUrl).toHaveBeenCalled()
      })
    })

    describe('POST /api/auth/visma/callback', () => {
      it('should handle OAuth callback successfully', async () => {
        const { VismaAuthService } = await import('../services/visma-auth.js')
        const { VismaApiService } = await import('../services/visma-api.js')
        
        const mockAuthService = {
          exchangeCodeForToken: vi.fn().mockResolvedValue({
            access_token: 'test_token',
            refresh_token: 'test_refresh',
            expires_in: 3600
          }),
          storeTokens: vi.fn().mockResolvedValue(undefined)
        }
        
        const mockApiService = {
          getCompanyInfo: vi.fn().mockResolvedValue({ name: 'Test Company' })
        }

        vi.mocked(VismaAuthService).mockImplementation(() => mockAuthService as any)
        vi.mocked(VismaApiService).mockImplementation(() => mockApiService as any)

        const response = await request(app)
          .post('/api/auth/visma/callback')
          .send({ code: 'test_code', state: 'test_state' })
          .expect(200)

        expect(response.body.success).toBe(true)
        expect(response.body.company).toBe('Test Company')
        expect(mockAuthService.exchangeCodeForToken).toHaveBeenCalledWith('test_code')
      })

      it('should validate request body', async () => {
        const response = await request(app)
          .post('/api/auth/visma/callback')
          .send({}) // Missing required fields
          .expect(400)

        expect(response.body).toHaveProperty('error')
      })
    })

    describe('GET /api/auth/visma/status', () => {
      it('should return connection status', async () => {
        const { VismaAuthService } = await import('../services/visma-auth.js')
        const { VismaApiService } = await import('../services/visma-api.js')
        
        const mockAuthService = {
          hasValidTokens: vi.fn().mockResolvedValue(true)
        }
        
        const mockApiService = {
          testConnection: vi.fn().mockResolvedValue(true),
          getCompanyInfo: vi.fn().mockResolvedValue({ name: 'Test Company' })
        }

        vi.mocked(VismaAuthService).mockImplementation(() => mockAuthService as any)
        vi.mocked(VismaApiService).mockImplementation(() => mockApiService as any)

        const response = await request(app)
          .get('/api/auth/visma/status')
          .expect(200)

        expect(response.body.connected).toBe(true)
        expect(response.body.company).toBe('Test Company')
      })
    })
  })

  describe('Invoice Routes', () => {
    describe('GET /api/invoices', () => {
      it('should return list of invoices', async () => {
        const { db } = await import('../db/database.js')
        const mockInvoices = [
          {
            id: 1,
            total_cents: 50000,
            currency: 'NOK',
            status: 'draft',
            created_at: new Date().toISOString()
          }
        ]

        vi.mocked(db.execute).mockResolvedValue(mockInvoices)

        const response = await request(app)
          .get('/api/invoices')
          .expect(200)

        expect(Array.isArray(response.body)).toBe(true)
      })
    })

    describe('POST /api/invoices/process-import', () => {
      it('should process import and create invoices', async () => {
        const { ExcelParserService } = await import('../services/excel-parser.js')
        const { PricingService } = await import('../services/pricing-service.js')
        const { VismaApiService } = await import('../services/visma-api.js')
        
        const mockRows = [
          {
            id: 1,
            status_code: 'OK',
            referanse: 'REF001',
            mottaker: 'Customer A',
            row_index: 1
          }
        ]

        const mockExcelParser = {
          getUnprocessedRows: vi.fn().mockResolvedValue(mockRows)
        }

        const mockPricingService = {
          calculatePricing: vi.fn().mockResolvedValue({
            presetCode: 'TRANSPORT_OK',
            unitPriceCents: 50000,
            totalCents: 50000,
            currency: 'NOK',
            vatPercent: 25
          })
        }

        const mockVismaApi = {
          findOrCreateCustomer: vi.fn().mockResolvedValue({ id: 'cust_1' }),
          createDraftInvoice: vi.fn().mockResolvedValue({ id: 'inv_1' })
        }

        const { db } = await import('../db/database.js')
        vi.mocked(db.insertInto).mockReturnValue(db as any)
        vi.mocked(db.values).mockReturnValue(db as any)
        vi.mocked(db.execute).mockResolvedValue([])
        vi.mocked(db.updateTable).mockReturnValue(db as any)
        vi.mocked(db.set).mockReturnValue(db as any)
        vi.mocked(db.where).mockReturnValue(db as any)

        vi.mocked(ExcelParserService).mockImplementation(() => mockExcelParser as any)
        vi.mocked(PricingService).mockImplementation(() => mockPricingService as any)
        vi.mocked(VismaApiService).mockImplementation(() => mockVismaApi as any)

        const response = await request(app)
          .post('/api/invoices/process-import')
          .send({ import_id: 1 })
          .expect(200)

        expect(response.body.processed).toBe(1)
        expect(mockExcelParser.getUnprocessedRows).toHaveBeenCalledWith(1)
        expect(mockPricingService.calculatePricing).toHaveBeenCalledWith('OK', 1, undefined)
        expect(mockVismaApi.findOrCreateCustomer).toHaveBeenCalledWith('Customer A')
        expect(mockVismaApi.createDraftInvoice).toHaveBeenCalled()
      })

      it('should validate request body', async () => {
        const response = await request(app)
          .post('/api/invoices/process-import')
          .send({}) // Missing import_id
          .expect(400)

        expect(response.body).toHaveProperty('error')
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404)

      expect(response.body.error).toBe('Route not found')
    })

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/auth/visma/callback')
        .send({ invalid: 'data' })
        .expect(400)

      expect(response.body).toHaveProperty('error')
    })
  })
})



