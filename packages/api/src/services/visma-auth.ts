import axios from 'axios';
import { db } from '../db/database.js';

export interface VismaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export class VismaAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly baseUrl: string;
  private readonly scope: string;

  constructor() {
    this.clientId = process.env.VISMA_CLIENT_ID!;
    this.clientSecret = process.env.VISMA_CLIENT_SECRET!;
    this.redirectUri = process.env.VISMA_REDIRECT_URI!;
    this.baseUrl = process.env.VISMA_BASE_URL!;
    this.scope = process.env.VISMA_SCOPE || 'ea:api ea:sales offline_access';

    if (!this.clientId || !this.clientSecret || !this.redirectUri || !this.baseUrl) {
      throw new Error('Missing required Visma configuration environment variables');
    }
  }

  /**
   * Generate the authorization URL for Visma OAuth flow
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scope,
      prompt: 'select_account', // Always prompt company selection
      acr_values: 'service:44643EB1-3F76-4C1C-A672-402AE8085934', // Show only eAccounting companies
      ...(state && { state }),
    });

    return `${this.baseUrl}/connect/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<VismaTokenResponse> {
    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.baseUrl}/connect/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<VismaTokenResponse> {
    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.baseUrl}/connect/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Store tokens in database
   */
  async storeTokens(
    tokens: VismaTokenResponse,
    companyName?: string
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db
      .insertInto('visma_tokens')
      .values({
        company_name: companyName || null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
      })
      .execute();
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string | null> {
    // Get the most recent token
    const tokenRecord = await db
      .selectFrom('visma_tokens')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!tokenRecord) {
      return null;
    }

    // Check if token is still valid (with 5 minute buffer)
    const now = new Date();
    const tokenExpiry = new Date(tokenRecord.expires_at);
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (tokenExpiry.getTime() - now.getTime() > bufferTime) {
      return tokenRecord.access_token;
    }

    // Token is expired or about to expire, refresh it
    try {
      const newTokens = await this.refreshToken(tokenRecord.refresh_token);
      
      // Update the token record
      await db
        .updateTable('visma_tokens')
        .set({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: new Date(Date.now() + newTokens.expires_in * 1000),
        })
        .where('id', '=', tokenRecord.id)
        .execute();

      return newTokens.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      // Delete the invalid token
      await db
        .deleteFrom('visma_tokens')
        .where('id', '=', tokenRecord.id)
        .execute();
      
      return null;
    }
  }

  /**
   * Check if we have valid tokens
   */
  async hasValidTokens(): Promise<boolean> {
    const token = await this.getValidAccessToken();
    return token !== null;
  }

  /**
   * Clear all stored tokens
   */
  async clearTokens(): Promise<void> {
    await db.deleteFrom('visma_tokens').execute();
  }
}
