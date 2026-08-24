# 🚀 BrandsIntel Deployment Guide

Complete step-by-step instructions to deploy BrandsIntel. Follow these exactly.

---

## **PHASE 1: Prepare (30 minutes)**

### **1.1: Get API Keys**

You need three things:

#### **Claude API Key**
```
1. Go to https://console.anthropic.com/
2. Sign up / log in
3. Click "API Keys"
4. Create new API key
5. Copy it (looks like: sk-ant-xxx...)
6. Save it somewhere safe
```

#### **Supabase Project**
```
1. Go to https://supabase.com/
2. Sign up / log in
3. Create new project
   - Project name: brandsintel
   - Password: something strong
   - Region: Europe (or your choice)
4. Wait for project to create (2-3 minutes)
5. Go to Project Settings → API
6. Copy:
   - Project URL (looks like: https://xxx.supabase.co)
   - Anon Public Key
```

Save these credentials in a text file.

---

## **PHASE 2: Set Up Database (15 minutes)**

### **2.1: Create Database Tables**

In Supabase:

```
1. Go to your project dashboard
2. Click "SQL Editor" on left sidebar
3. Click "New Query"
4. Copy entire contents of supabase-schema.sql
5. Paste into the editor
6. Click "Run"
7. Wait for "Success" message
```

Done! Your database is set up.

---

## **PHASE 3: Set Up WhatsApp (2-4 weeks start)**

**Start this NOW — approval takes time**

### **3.1: Get WhatsApp Business Account**

```
1. Go to https://www.twilio.com/whatsapp
2. Click "Get Started"
3. Create Twilio account (free with credits)
4. Verify phone number (yours)
5. Request WhatsApp API access
   - Business Name: BrandsIntel
   - Use Case: Fraud verification
   - Expected volume: Moderate (1000s/month)
6. Submit and WAIT (1-4 weeks for approval)
```

**While you wait:** Continue with Phases 4-5

### **3.2: Get Twilio Credentials** (after approval)

Once approved:

```
1. Go to Twilio Console
2. Go to WhatsApp → Senders
3. Copy your WhatsApp Number (starts with whatsapp:)
4. Go to Account → Settings
5. Copy:
   - Account SID
   - Auth Token (keep secret!)
6. Add to your .env file
```

---

## **PHASE 4: Deploy Backend (30 minutes)**

### **4.1: Set Up on Render**

Render is free and easy. 

```
1. Go to https://render.com/
2. Sign up with GitHub (or email)
3. Click "New +"
4. Select "Web Service"
5. Connect to GitHub:
   - Fork this repo: https://github.com/brandsintel/backend
   - OR paste your code into Render's code editor
6. Fill in:
   - Name: brandsintel-backend
   - Environment: Node
   - Build command: npm install
   - Start command: node brandsintel-backend.js
7. Add Environment Variables:
   - CLAUDE_API_KEY: [your Claude key]
   - SUPABASE_URL: [your Supabase URL]
   - SUPABASE_KEY: [your Supabase anon key]
   - NODE_ENV: production
   - PORT: 3000
8. Click "Create Web Service"
9. WAIT for deployment (5-10 minutes)
10. When done, copy the URL (looks like: https://brandsintel-backend.onrender.com)
```

**Test it:**

```
Open in browser:
https://brandsintel-backend.onrender.com/api/health

Should return:
{"status":"ok","timestamp":"2024-01-15T..."}
```

Save your backend URL.

---

## **PHASE 5: Connect WhatsApp Bot (10 minutes)**

Once Twilio WhatsApp is approved:

### **5.1: Update Backend with WhatsApp**

In your `brandsintel-backend.js`, add this route at the end (before the PORT line):

```javascript
// Add WhatsApp bot routes
const whatsappRouter = require('./whatsapp-bot');
app.use('/whatsapp', whatsappRouter);
```

Then redeploy:

```
1. In Render dashboard
2. Select brandsintel-backend
3. Click "Manual Deploy"
4. Click "Deploy latest commit"
5. Wait for deployment
```

### **5.2: Configure Twilio Webhook**

```
1. Go to Twilio Console → WhatsApp → Settings
2. Find "Webhook for incoming messages"
3. Paste: https://YOUR_BACKEND_URL/whatsapp/webhook
   (Replace YOUR_BACKEND_URL with your Render URL)
4. Method: POST
5. Click "Save"
6. Test: Send a message to your WhatsApp number
   Send: "Help"
   You should get instructions back
```

---

## **PHASE 6: Deploy Dashboard (20 minutes)**

### **6.1: Deploy React Dashboard**

Create a new web service on Render for the dashboard:

```
1. Render → New Web Service
2. Use the dashboard.jsx code
3. Build command: npm run build
4. Start command: npx serve -s build
5. Environment variables:
   - REACT_APP_API_BASE: https://YOUR_BACKEND_URL
     (Your backend URL from Phase 4)
6. Click "Create"
7. Wait for deployment
```

Your dashboard is now live at a public URL.

---

## **PHASE 7: Test Everything (30 minutes)**

### **7.1: Test Verification API**

```
curl -X POST https://YOUR_BACKEND_URL/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "ABC Electronics",
    "website": "abc-electronics.com"
  }'

Should return:
{
  "businessName": "ABC Electronics",
  "trustScore": 45,
  "riskLevel": "caution",
  ...
}
```

### **7.2: Test Payment Verification**

```
curl -X POST https://YOUR_BACKEND_URL/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "ABC ELECTRONICS",
    "bank": "GTBank",
    "accountNumber": "0123456789"
  }'
```

### **7.3: Test WhatsApp Bot**

```
Send to your WhatsApp number:
"Check Jumia"

Bot should reply with verification
```

### **7.4: Test Dashboard**

```
Go to: YOUR_DASHBOARD_URL/?business=ABC%20Electronics

Should show:
- Trust score card
- Business info
- Risk assessment
- Recent reports
```

---

## **PHASE 8: Public Launch (1 day)**

### **8.1: Set Up WhatsApp Business Profile**

```
1. In Twilio console
2. Edit WhatsApp number details:
   - Display Name: BrandsIntel
   - Description: "Verify Nigerian businesses before sending money"
   - Profile picture: Your logo
3. Save
```

### **8.2: Create Landing Page**

```
Create simple page at your domain:
- What is BrandsIntel
- How to use (text "Help" to +234...)
- Link to dashboard
- Contact info
```

### **8.3: Promote to Users**

```
- Share WhatsApp number on Twitter
- Post on LinkedIn
- Message to first 100 test users
- Get feedback
```

---

## **PHASE 9: Monitor & Scale (Ongoing)**

### **9.1: Monitor API Performance**

In Render dashboard:
```
- Check logs for errors
- Monitor CPU/memory usage
- Check response times
```

### **9.2: Monitor Costs**

Track:
- Supabase usage (free until 50GB)
- Render usage (free tier has limits)
- Twilio WhatsApp costs (₦0.50 per message after first 1000/month)
- Claude API costs (~₦2-5 per verification)

### **9.3: Scale When Needed**

When you hit limits:
- Upgrade Render to paid tier ($12/month)
- Move to Vercel or Railway if Render hits limits
- Optimize Claude prompts to reduce token usage

---

## **Troubleshooting**

### **Backend won't start**

```
1. Check .env variables are correct
2. Check node_modules installed: npm install
3. Check syntax in brandsintel-backend.js
4. Check Supabase connection: ping supabase
```

### **WhatsApp bot not responding**

```
1. Check webhook URL is correct in Twilio
2. Check backend logs: Render → Logs
3. Test with: GET /api/health
4. Check Twilio number is configured
```

### **Database errors**

```
1. Go to Supabase → SQL Editor
2. Check if tables created: SELECT * FROM businesses;
3. Run schema script again if missing tables
4. Check Supabase credentials in .env
```

### **Claude API errors**

```
1. Check API key is correct
2. Check API key has permissions
3. Check you have API credits
4. Test with: curl https://api.anthropic.com/v1/models
   (should list available models)
```

---

## **Next Steps After Launch**

1. **Get first 100 users** — Manual marketing
2. **Collect feedback** — What features matter most?
3. **Optimize verification** — Improve accuracy, speed
4. **Get first business customer** — One ₦50k/month deal
5. **Integrate with Paystack** — Real revenue
6. **Scale data collection** — Better risk assessments

---

## **Support**

- Claude (AI): I built everything — ask if something breaks
- Render docs: https://render.com/docs
- Supabase docs: https://supabase.io/docs
- Twilio docs: https://www.twilio.com/docs

Good luck! 🚀
