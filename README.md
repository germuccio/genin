# 📄 Genin - Modern Invoice Processing App

A modern, multi-user invoice processing application with Visma eAccounting integration. Built with Vue 3, TypeScript, and Node.js.

## ✨ Features

- 🔐 **Secure Multi-User Access** - Shared password authentication with session management
- 📤 **Excel File Processing** - Upload and process Excel files with invoice data
- 🧾 **Automatic Invoice Generation** - Create invoices in Visma eAccounting with NOK currency
- 📋 **Invoice Management** - View, manage, and track invoice status
- ⚙️ **Flexible Configuration** - Per-user Visma credentials stored locally
- 🌍 **Production & Sandbox Support** - Switch between Visma environments
- 🎨 **Modern UI** - Clean, responsive design with dark mode support

## 🚀 Quick Start

### Local Development

1. **Clone and Install**
   ```bash
   git clone <your-repo>
   cd Genin
   npm run install:all
   ```

2. **Environment Setup**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development**
   ```bash
   npm run dev
   # Frontend: http://localhost:5173
   # API: http://localhost:3000
   ```

### Production Deployment (Vercel)

1. **Deploy to Vercel**
   ```bash
   npm i -g vercel
   vercel --prod
   ```

2. **Set Environment Variables** in Vercel Dashboard:
   - `APP_PASSWORD` - Your shared password
   - `APP_SESSION_SECRET` - 32+ character random string
   - `VISMA_API_ENVIRONMENT` - `production` or `sandbox`
   - `FRONTEND_URL` - Your Vercel app URL

3. **Configure Visma OAuth**
   - Add your Vercel URL as redirect URI in Visma Developer Portal
   - Users add their Client ID/Secret in app settings

## 🔧 Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_PASSWORD` | Shared login password | `your-secure-password` |
| `APP_SESSION_SECRET` | Session encryption key | `32-char-random-string` |
| `VISMA_API_ENVIRONMENT` | API environment | `production` or `sandbox` |
| `VISMA_API_BASE_URL` | API base URL | Auto-detected from environment |
| `VISMA_IDENTITY_URL` | Identity server URL | Auto-detected from environment |
| `FRONTEND_URL` | Frontend URL for CORS | `https://your-app.vercel.app` |

### Visma API Environments

## 🧪 **When to Use SANDBOX**

Use sandbox environment for:
- ✅ **Testing the application** - Try features without risk
- ✅ **Development** - Safe environment for coding/debugging  
- ✅ **Training users** - Let users learn the system
- ✅ **Validating integrations** - Test Excel uploads and processing
- ✅ **Demo purposes** - Show the app to stakeholders

**Sandbox Configuration:**
```bash
VISMA_API_ENVIRONMENT=sandbox
# URLs auto-configure to:
# API: https://eaccountingapi-sandbox.vismaonline.com
# Identity: https://identity-sandbox.vismaonline.com
```

## 🚀 **When to Use PRODUCTION**

Use production environment for:
- ✅ **Live invoice processing** - Real invoices sent to customers
- ✅ **Daily business operations** - Actual business workflow
- ✅ **Final invoice generation** - Invoices that will be sent/paid

**Production Configuration:**
```bash
VISMA_API_ENVIRONMENT=production
# URLs auto-configure to:
# API: https://eaccountingapi.vismaonline.com  
# Identity: https://identity.vismaonline.com
```

## ⚠️ **Important Notes**

- **Sandbox is SAFE** - No real invoices are created, no money involved
- **Production is LIVE** - Real invoices sent to real customers
- **Easy switching** - Change one environment variable to switch
- **Same features** - Both environments have identical functionality
- **Separate credentials** - You may need different Client ID/Secret for each

## 📱 Usage

### 1. Login
- Navigate to your app URL
- Enter the shared password
- Access granted to all features

### 2. Setup Visma Connection
- Go to **Setup** tab
- Add your Visma Client ID and Secret (stored locally in browser)
- Click "Connect to Visma eAccounting"
- Complete OAuth flow

### 3. Process Invoices
- Go to **Upload** tab
- Upload Excel file with invoice data
- Review processed invoices
- Generate invoices in Visma

### 4. Manage Invoices
- Go to **Invoices** tab
- View all processed invoices
- Delete drafts if needed
- Track invoice status

## 🏗️ Architecture

### Frontend (Vue 3)
- **Framework**: Vue 3 with Composition API
- **Routing**: Vue Router with authentication guards
- **State**: Pinia for state management
- **Styling**: Modern CSS with design system
- **Build**: Vite for fast development and builds

### Backend (Node.js)
- **Framework**: Express.js with TypeScript
- **Auth**: Session-based with HttpOnly cookies
- **File Processing**: Multer + XLSX for Excel parsing
- **API Integration**: Axios for Visma API calls
- **Security**: CORS, input validation, secure sessions

### Deployment
- **Platform**: Vercel (serverless functions)
- **Frontend**: Static build served from CDN
- **Backend**: Serverless functions for API routes
- **Storage**: Stateless (no database required)

## 🔒 Security Features

- **Session Management**: Secure HttpOnly cookies with HMAC signing
- **CORS Protection**: Configured allowed origins
- **Input Validation**: Zod schemas for data validation
- **Local Credentials**: Visma credentials stored in browser only
- **Environment Isolation**: Separate sandbox/production configs

## 🛠️ Development

### Build Commands
```bash
# Development
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Testing
npm run test
```

### Project Structure
```
Genin/
├── packages/
│   ├── api/          # Backend API
│   ├── web/          # Frontend Vue app
│   └── shared/       # Shared types/utils
├── vercel.json       # Vercel deployment config
├── env.example       # Environment variables template
└── README.md         # This file
```

## 📊 Tech Stack

- **Frontend**: Vue 3, TypeScript, Vite, Pinia, Vue Router
- **Backend**: Node.js, Express, TypeScript, Multer, XLSX
- **API Integration**: Visma eAccounting API
- **Deployment**: Vercel (serverless)
- **Styling**: Modern CSS with design system
- **Authentication**: Session-based auth

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

ISC License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the environment configuration
2. Verify Visma API credentials
3. Review browser console for errors
4. Check Vercel function logs

## 🔗 References

- [Visma eAccounting API Documentation](https://eaccountingapi.vismaonline.com/swagger/ui/index#)
- [Vue 3 Documentation](https://vuejs.org/)
- [Vercel Documentation](https://vercel.com/docs)