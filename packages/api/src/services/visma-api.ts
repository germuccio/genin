import axios, { AxiosInstance } from 'axios';
import { VismaAuthService } from './visma-auth.js';

export interface VismaCustomer {
  id: string;
  name: string;
  organizationNumber?: string;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export interface VismaInvoice {
  id: string;
  customerNumber: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  currency: string;
  status: string;
  rows: VismaInvoiceRow[];
}

export interface VismaInvoiceRow {
  productCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  amount: number;
}

export interface CreateCustomerRequest {
  name: string;
  organizationNumber?: string;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export interface CreateInvoiceRequest {
  customerNumber: string;
  dueDate: string;
  currency: string;
  rows: {
    productCode?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
  }[];
}

export class VismaApiService {
  private readonly authService: VismaAuthService;
  private readonly baseUrl: string;
  private client: AxiosInstance;

  constructor() {
    this.authService = new VismaAuthService();
    this.baseUrl = process.env.VISMA_API_BASE_URL || process.env.VISMA_BASE_URL!;
    
    this.client = axios.create({
      baseURL: `${this.baseUrl}/v2`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(async (config) => {
      const token = await this.authService.getValidAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  /**
   * Get all customers
   */
  async getCustomers(): Promise<VismaCustomer[]> {
    try {
      const response = await this.client.get('/customers');
      return response.data;
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw new Error('Failed to fetch customers from Visma');
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<VismaCustomer> {
    try {
      const response = await this.client.get(`/customers/${customerId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw new Error(`Failed to fetch customer ${customerId} from Visma`);
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(customerData: CreateCustomerRequest): Promise<VismaCustomer> {
    try {
      const response = await this.client.post('/customers', customerData);
      return response.data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw new Error('Failed to create customer in Visma');
    }
  }

  /**
   * Find customer by name or create if not exists
   */
  async findOrCreateCustomer(name: string, email?: string): Promise<VismaCustomer> {
    try {
      // First, try to find existing customer
      const customers = await this.getCustomers();
      const existingCustomer = customers.find(
        customer => customer.name.toLowerCase() === name.toLowerCase()
      );

      if (existingCustomer) {
        return existingCustomer;
      }

      // Create new customer if not found
      return await this.createCustomer({
        name,
        email,
      });
    } catch (error) {
      console.error('Error finding or creating customer:', error);
      throw new Error('Failed to find or create customer in Visma');
    }
  }

  /**
   * Create a draft invoice
   */
  async createDraftInvoice(invoiceData: CreateInvoiceRequest): Promise<VismaInvoice> {
    try {
      const response = await this.client.post('/invoices/drafts', invoiceData);
      return response.data;
    } catch (error) {
      console.error('Error creating draft invoice:', error);
      throw new Error('Failed to create draft invoice in Visma');
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<VismaInvoice> {
    try {
      const response = await this.client.get(`/invoices/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching invoice:', error);
      throw new Error(`Failed to fetch invoice ${invoiceId} from Visma`);
    }
  }

  /**
   * Send invoice (mark as sent)
   */
  async sendInvoice(invoiceId: string): Promise<void> {
    try {
      await this.client.post(`/invoices/${invoiceId}/send`);
    } catch (error) {
      console.error('Error sending invoice:', error);
      throw new Error(`Failed to send invoice ${invoiceId} in Visma`);
    }
  }

  /**
   * Attach file to invoice
   */
  async attachFileToInvoice(
    invoiceId: string,
    filename: string,
    fileData: Buffer,
    mimeType: string
  ): Promise<void> {
    try {
      const formData = new FormData();
      const blob = new Blob([fileData], { type: mimeType });
      formData.append('file', blob, filename);

      await this.client.post(`/invoices/${invoiceId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } catch (error) {
      console.error('Error attaching file to invoice:', error);
      throw new Error(`Failed to attach file to invoice ${invoiceId} in Visma`);
    }
  }

  /**
   * Get company information
   */
  async getCompanyInfo(): Promise<any> {
    try {
      const response = await this.client.get('/company');
      return response.data;
    } catch (error) {
      console.error('Error fetching company info:', error);
      throw new Error('Failed to fetch company info from Visma');
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getCompanyInfo();
      return true;
    } catch (error) {
      console.error('Visma API connection test failed:', error);
      return false;
    }
  }
}
