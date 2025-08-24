import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PricingService } from '../services/pricing-service.js'

// Mock the database
vi.mock('../db/database.js', () => ({
  db: {
    selectFrom: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    executeTakeFirst: vi.fn(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returningAll: vi.fn().mockReturnThis(),
    executeTakeFirstOrThrow: vi.fn(),
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    deleteFrom: vi.fn().mockReturnThis(),
  }
}))

describe('PricingService', () => {
  let pricingService: PricingService

  beforeEach(() => {
    pricingService = new PricingService()
    vi.clearAllMocks()
  })

  describe('calculatePricing', () => {
    it('should calculate pricing for OK status code', async () => {
      const mockPreset = {
        id: 1,
        code: 'TRANSPORT_OK',
        name: 'Standard Transport Service',
        unit_price_cents: 50000,
        currency: 'NOK',
        vat_code: '25',
        created_at: new Date()
      }

      // Mock database response
      const { db } = await import('../db/database.js')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(mockPreset)

      const result = await pricingService.calculatePricing('OK', 2)

      expect(result).toEqual({
        presetCode: 'TRANSPORT_OK',
        unitPriceCents: 50000,
        quantity: 2,
        totalCents: 100000,
        currency: 'NOK',
        vatPercent: 25,
        description: 'Standard Transport Service'
      })
    })

    it('should throw error for non-existent preset', async () => {
      const { db } = await import('../db/database.js')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(null)

      await expect(
        pricingService.calculatePricing('INVALID_CODE')
      ).rejects.toThrow('Preset not found for code: TRANSPORT_OTHER')
    })

    it('should use custom preset code when provided', async () => {
      const mockPreset = {
        id: 1,
        code: 'CUSTOM_CODE',
        name: 'Custom Service',
        unit_price_cents: 75000,
        currency: 'NOK',
        vat_code: '25',
        created_at: new Date()
      }

      const { db } = await import('../db/database.js')
      vi.mocked(db.executeTakeFirst).mockResolvedValue(mockPreset)

      const result = await pricingService.calculatePricing('OK', 1, 'CUSTOM_CODE')

      expect(result.presetCode).toBe('CUSTOM_CODE')
      expect(result.description).toBe('Custom Service')
    })
  })

  describe('formatPrice', () => {
    it('should format price correctly in NOK', () => {
      const formatted = pricingService.formatPrice(50000, 'NOK')
      expect(formatted).toMatch(/500[\s,.]00.*kr/i) // Allow for various Norwegian formatting
    })

    it('should format price with default currency', () => {
      const formatted = pricingService.formatPrice(25000)
      expect(formatted).toMatch(/250/)
    })
  })

  describe('parsePriceToCents', () => {
    it('should parse Norwegian price format', () => {
      expect(pricingService.parsePriceToCents('500,50 kr')).toBe(50050)
      expect(pricingService.parsePriceToCents('1 234,56')).toBe(123456)
      expect(pricingService.parsePriceToCents('500.50')).toBe(50050)
    })

    it('should throw error for invalid price format', () => {
      expect(() => pricingService.parsePriceToCents('invalid')).toThrow('Invalid price format')
    })
  })

  describe('createInvoiceLineItem', () => {
    it('should create invoice line item from pricing calculation', () => {
      const pricing = {
        presetCode: 'TRANSPORT_OK',
        unitPriceCents: 50000,
        quantity: 1,
        totalCents: 50000,
        currency: 'NOK',
        vatPercent: 25,
        description: 'Standard Transport Service'
      }

      const lineItem = pricingService.createInvoiceLineItem(pricing)

      expect(lineItem).toEqual({
        description: 'Standard Transport Service',
        quantity: 1,
        unitPriceCents: 50000,
        totalCents: 50000,
        currency: 'NOK',
        vatPercent: 25,
        productCode: 'TRANSPORT_OK'
      })
    })

    it('should use custom description when provided', () => {
      const pricing = {
        presetCode: 'TRANSPORT_OK',
        unitPriceCents: 50000,
        quantity: 1,
        totalCents: 50000,
        currency: 'NOK',
        vatPercent: 25,
        description: 'Standard Transport Service'
      }

      const lineItem = pricingService.createInvoiceLineItem(pricing, 'Custom Description')

      expect(lineItem.description).toBe('Custom Description')
    })
  })
})



