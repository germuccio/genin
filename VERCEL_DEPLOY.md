# 🚀 Quick Vercel Deployment (No Database)

## Deploy Now - 5 Minutes Setup!

### 1. Push to Git
```bash
git add .
git commit -m "Ready for Vercel deployment with hybrid token storage"
git push origin main
```

### 2. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"**
3. Import your GitHub repository
4. Vercel will auto-detect the configuration from `vercel.json`
5. Click **"Deploy"**

### 3. Set Environment Variables
After deployment, go to **Project Settings** → **Environment Variables** and add:

```bash
# Required - Application
APP_PASSWORD=your_shared_password_here
FRONTEND_URL=https://your-app-name.vercel.app

# Required - Visma eAccounting API
VISMA_CLIENT_ID=aiautomationsandbox
VISMA_CLIENT_SECRET=rR.ZqjR=;WIcQP9FgmIiqJSuaeMldq2wlR8PJIvvBtAQxo2h2RfLYgTO1INiEw2O
VISMA_REDIRECT_URI=https://your-app-name.vercel.app/callback
VISMA_BASE_URL=https://identity.vismaonline.com
VISMA_SCOPE=ea:api ea:sales ea:purchase ea:accounting vls:api offline_access

# Required - Environment
NODE_ENV=production
```

**Important**: Replace `your-app-name.vercel.app` with your actual Vercel URL!

### 4. Redeploy
After setting environment variables:
1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Wait for deployment to complete

### 5. Test Your App
1. Visit your Vercel URL
2. You should see the login page
3. Enter your shared password
4. Go to Setup and test Visma connection
5. Article mapping should appear after connecting!

## ✅ What Works Without Database
- ✅ User authentication
- ✅ File uploads and processing  
- ✅ Visma OAuth connection
- ✅ Article mapping
- ✅ Invoice creation in Visma
- ✅ All application features

## ⚠️ What to Expect
- Tokens are stored in memory
- Users need to reconnect to Visma after each deployment
- Article mappings reset on deployment
- Perfect for testing and light usage!

## 🔄 Adding Database Later
When ready for persistent storage, just:
1. Set up Vercel Postgres or external database
2. Add `DATABASE_URL` environment variable
3. Run migration script
4. No code changes needed!

---

**Ready to go!** Your app will work exactly like local development, but accessible from anywhere. 🎉
