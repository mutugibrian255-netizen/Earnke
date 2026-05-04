# EarnKE Backend — Deployment Guide

## Deploy to Railway (Free Hosting)

### Step 1 — Install Git & Push Code
1. Download and install Git: https://git-scm.com
2. Create a free GitHub account: https://github.com
3. Create a new repository called "earnke-backend"
4. Upload all these files to your GitHub repo

### Step 2 — Deploy on Railway
1. Go to https://railway.app and sign up with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your "earnke-backend" repo
4. Railway will auto-detect Node.js and deploy

### Step 3 — Set Environment Variables on Railway
In your Railway project dashboard, go to "Variables" and add each of these:

MONGODB_URI = mongodb+srv://Brian:DKMfafhN8o14XNUh@cluster0.oxamv2p.mongodb.net/earnke
MPESA_CONSUMER_KEY = uUKSJZYP6hnS4CMEz9U6Abj8duEveLs1GW21saxuzK7yMrWA
MPESA_CONSUMER_SECRET = 7umo95xF6Lqgpkpt24wsh76bgQsMDKUZoWMVsnsRiSh5JlVh2cacYGqAomhT2Tcz
MPESA_SHORTCODE = 5912502
MPESA_PASSKEY = bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
BASE_URL = https://YOUR-RAILWAY-URL.up.railway.app  ← update this after deploy
JWT_SECRET = earnke_super_secret_jwt_key_2026
ADMIN_PHONE = 0700000000  ← change to your phone
ADMIN_PASS = EarnKeAdmin2026  ← change to your password
PORT = 3000

### Step 4 — Get Your Railway URL
After deploy, Railway gives you a URL like:
https://earnke-backend-production.up.railway.app

Update BASE_URL in Railway Variables to that URL.

### Step 5 — Connect Frontend
Update your frontend HTML file:
- Find: const API = 'http://localhost:3000'
- Replace with: const API = 'https://YOUR-RAILWAY-URL.up.railway.app'

### Step 6 — Go Live with M-Pesa
When ready for real payments:
1. Go to developer.safaricom.co.ke → Go Live
2. Replace sandbox URLs in server.js with production:
   - sandbox.safaricom.co.ke → api.safaricom.co.ke
3. Update MPESA_PASSKEY with your real passkey from Safaricom

## Admin Login
Phone: 0700000000 (change in Railway variables)
Password: EarnKeAdmin2026 (change in Railway variables)

## API Endpoints
POST /api/auth/register    — Register new user
POST /api/auth/login       — Login
POST /api/auth/admin       — Admin login
POST /api/mpesa/pay        — Initiate STK Push
POST /api/mpesa/callback   — M-Pesa callback (auto)
GET  /api/mpesa/status/:id — Check payment status
GET  /api/user/dashboard   — Get user data + tasks
POST /api/user/task/:id    — Complete a task
POST /api/user/withdraw    — Request withdrawal
GET  /api/admin/stats      — Admin dashboard data
POST /api/admin/task       — Add new task
DEL  /api/admin/task/:id   — Delete task
PATCH /api/admin/withdraw/:id — Mark withdrawal paid
