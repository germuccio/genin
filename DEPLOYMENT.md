# Deployment Guide

## Vercel Deployment with Full Visma Integration

This application now supports full Visma eAccounting integration on Vercel using the complete Express server instead of serverless functions.

### Configuration

The application has been updated to:

1. **Use the full Express server** (`packages/api/src/minimal-server.ts`) instead of individual serverless functions
2. **Hybrid token storage** - uses PostgreSQL for production, falls back to in-memory storage for local development
3. **Automatic token refresh** to handle expired access tokens (when database is available)
4. **All Visma features** including article mapping, invoice creation, and customer management
5. **Local development friendly** - works without PostgreSQL for development, but uses database in production

### Required Environment Variables

Make sure these environment variables are set in your Vercel project:

```bash
# Database (Required for production - persistent token storage)
DATABASE_URL=postgresql://user:password@host:port/database

# Application
APP_PASSWORD=your_shared_password
FRONTEND_URL=https://your-app.vercel.app

# Visma eAccounting API
VISMA_CLIENT_ID=your_visma_client_id
VISMA_CLIENT_SECRET=your_visma_client_secret
VISMA_REDIRECT_URI=https://your-app.vercel.app/callback
VISMA_BASE_URL=https://identity.vismaonline.com
VISMA_SCOPE=ea:api ea:sales ea:purchase ea:accounting vls:api offline_access

# Node Environment
NODE_ENV=production
```

### Local Development

For local development, you **don't need PostgreSQL**. The application will automatically:
- Detect that the database is unavailable
- Fall back to in-memory token storage
- Log "📝 Database not available, using in-memory tokens for local development"
- Work exactly the same as before, but tokens won't persist between server restarts

This means you can run the application locally with just:
```bash
npm run dev --workspace=packages/api
npm run dev --workspace=packages/web
```

### Database Setup

**Vercel does NOT automatically provide a database.** You need to set up PostgreSQL:

#### **Option 1: Vercel Postgres (Recommended)**
1. Go to your Vercel project dashboard
2. Click **Storage** tab → **Create Database** → **Postgres**
3. Vercel automatically sets `DATABASE_URL` environment variable
4. Skip to step 3 below (migration)

#### **Option 2: External Database**
Popular options:
- **Neon** - Free PostgreSQL tier
- **Supabase** - Free tier with 500MB  
- **Railway** - Simple setup

1. Create database with your chosen provider
2. Copy the connection string
3. Set `DATABASE_URL` in Vercel environment variables

### Deployment Steps

1. **Set up database** (see Database Setup above)

2. **Push your changes** to your Git repository

3. **Deploy to Vercel** - the new `vercel.json` configuration will:
   - Build the frontend (`packages/web`) as a static site
   - Build and deploy the API server (`packages/api/src/minimal-server.ts`) as a Node.js function
   - Route all `/api/*` requests to the server
   - Serve the frontend for all other requests

4. **Run database migration** after deployment:
   ```bash
   # Clone your repo locally and run:
   cd packages/api
   DATABASE_URL="your_database_url" npm run migrate:prod
   
   # Or manually run the SQL from:
   # packages/api/src/db/migrations/001_initial_schema.sql
   ```

### Features Available on Vercel

✅ **Full Visma Integration**:
- OAuth authentication with Visma eAccounting
- Article mapping and management
- Customer creation and management
- Invoice creation in Visma
- Automatic token refresh
- Draft invoice management

✅ **Application Features**:
- User authentication with shared password
- File upload and processing
- Invoice list and management
- Pricing presets configuration
- Real-time connection status

### Key Improvements

1. **Persistent Token Storage**: Tokens are now stored in PostgreSQL instead of in-memory, ensuring they persist across deployments and server restarts.

2. **Automatic Token Refresh**: The `VismaAuthService` automatically refreshes expired tokens using the refresh token.

3. **Better Error Handling**: Proper error handling for expired or invalid tokens with automatic cleanup.

4. **Production Ready**: The same codebase works identically in local development and production deployment.

### Testing

After deployment, you can test the integration by:

1. Visiting your Vercel URL
2. Logging in with your shared password
3. Going to Setup and connecting to Visma eAccounting
4. Verifying that the Article Mapping section appears
5. Testing invoice creation and management

The application should now work exactly the same as your local development environment, with full Visma eAccounting integration.
