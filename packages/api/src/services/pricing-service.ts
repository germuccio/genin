import { db } from '../db/database.js';
import type { PresetTable } from '../db/types.js';

export interface PricingCalculation {
  presetCode: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  currency: string;
  vatPercent: number;
  description: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
  vatPercent: number;
  productCode?: string;
}

export class PricingService {
  /**
   * Get all available presets
   */
  async getAllPresets(): Promise<PresetTable[]> {
    return db
      .selectFrom('presets')
      .selectAll()
      .orderBy('code', 'asc')
      .execute();
  }

  /**
   * Get preset by code
   */
  async getPresetByCode(code: string): Promise<PresetTable | null> {
    const result = await db
      .selectFrom('presets')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
    return result || null;
  }

  /**
   * Calculate pricing for a status code
   */
  async calculatePricing(
    statusCode: string,
    quantity: number = 1,
    customPresetCode?: string
  ): Promise<PricingCalculation> {
    // Determine which preset to use
    let presetCode = customPresetCode;
    
    if (!presetCode) {
      presetCode = this.mapStatusCodeToPreset(statusCode);
    }

    // Get preset from database
    const preset = await this.getPresetByCode(presetCode);
    
    if (!preset) {
      throw new Error(`Preset not found for code: ${presetCode}`);
    }

    // Calculate total
    const totalCents = preset.unit_price_cents * quantity;

    return {
      presetCode: preset.code,
      unitPriceCents: preset.unit_price_cents,
      quantity,
      totalCents,
      currency: preset.currency,
      vatPercent: this.getVatPercentage(preset.vat_code),
      description: preset.name,
    };
  }

  /**
   * Map status code to default preset code
   */
  private mapStatusCodeToPreset(statusCode: string): string {
    const mapping: Record<string, string> = {
      'OK': 'TRANSPORT_OK',
      'MAN': 'TRANSPORT_MAN',
      'OTHER': 'TRANSPORT_OTHER',
      // Add more mappings as needed
    };

    return mapping[statusCode.toUpperCase()] || 'TRANSPORT_OTHER';
  }

  /**
   * Convert VAT code to percentage
   */
  private getVatPercentage(vatCode: string): number {
    const vatMapping: Record<string, number> = {
      '25': 25,
      '15': 15,
      '12': 12,
      '0': 0,
      'exempt': 0,
      // Add more VAT codes as needed
    };

    return vatMapping[vatCode] || 25; // Default to 25% VAT
  }

  /**
   * Create invoice line item from pricing calculation
   */
  createInvoiceLineItem(
    pricing: PricingCalculation,
    description?: string
  ): InvoiceLineItem {
    return {
      description: description || pricing.description,
      quantity: pricing.quantity,
      unitPriceCents: pricing.unitPriceCents,
      totalCents: pricing.totalCents,
      currency: pricing.currency,
      vatPercent: pricing.vatPercent,
      productCode: pricing.presetCode,
    };
  }

  /**
   * Calculate bulk pricing for multiple items
   */
  async calculateBulkPricing(
    items: Array<{
      statusCode: string;
      quantity?: number;
      customPresetCode?: string;
      description?: string;
    }>
  ): Promise<{
    lineItems: InvoiceLineItem[];
    totalCents: number;
    currency: string;
  }> {
    const lineItems: InvoiceLineItem[] = [];
    let totalCents = 0;
    let currency = 'NOK'; // Default currency

    for (const item of items) {
      const pricing = await this.calculatePricing(
        item.statusCode,
        item.quantity || 1,
        item.customPresetCode
      );

      const lineItem = this.createInvoiceLineItem(pricing, item.description);
      lineItems.push(lineItem);
      totalCents += lineItem.totalCents;
      
      // Use currency from first item
      if (lineItems.length === 1) {
        currency = lineItem.currency;
      }
    }

    return {
      lineItems,
      totalCents,
      currency,
    };
  }

  /**
   * Create or update preset
   */
  async createOrUpdatePreset(preset: Omit<PresetTable, 'id' | 'created_at'>): Promise<PresetTable> {
    const existingPreset = await this.getPresetByCode(preset.code);

    if (existingPreset) {
      // Update existing preset
      const updatedPreset = await db
        .updateTable('presets')
        .set({
          name: preset.name,
          unit_price_cents: preset.unit_price_cents,
          currency: preset.currency,
          vat_code: preset.vat_code,
        })
        .where('code', '=', preset.code)
        .returningAll()
        .executeTakeFirstOrThrow();

      return updatedPreset;
    } else {
      // Create new preset
      const newPreset = await db
        .insertInto('presets')
        .values({
          code: preset.code,
          name: preset.name,
          unit_price_cents: preset.unit_price_cents,
          currency: preset.currency,
          vat_code: preset.vat_code,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return newPreset;
    }
  }

  /**
   * Delete preset
   */
  async deletePreset(code: string): Promise<boolean> {
    const result = await db
      .deleteFrom('presets')
      .where('code', '=', code)
      .execute();

    return result.length > 0;
  }

  /**
   * Get pricing statistics
   */
  async getPricingStatistics() {
    const stats = await db
      .selectFrom('presets')
      .select([
        (eb) => eb.fn.count('id').as('total_presets'),
        (eb) => eb.fn.avg('unit_price_cents').as('avg_price_cents'),
        (eb) => eb.fn.min('unit_price_cents').as('min_price_cents'),
        (eb) => eb.fn.max('unit_price_cents').as('max_price_cents'),
      ])
      .executeTakeFirst();

    return {
      totalPresets: Number(stats?.total_presets || 0),
      avgPriceCents: Number(stats?.avg_price_cents || 0),
      minPriceCents: Number(stats?.min_price_cents || 0),
      maxPriceCents: Number(stats?.max_price_cents || 0),
    };
  }

  /**
   * Format price for display
   */
  formatPrice(cents: number, currency: string = 'NOK'): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Parse price string to cents
   */
  parsePriceToCents(priceString: string): number {
    // Remove currency symbols and convert to number
    const cleanString = priceString.replace(/[^\d.,]/g, '');
    const normalizedString = cleanString.replace(',', '.');
    const amount = parseFloat(normalizedString);
    
    if (isNaN(amount)) {
      throw new Error(`Invalid price format: ${priceString}`);
    }

    return Math.round(amount * 100);
  }
}


