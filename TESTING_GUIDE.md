# 🧪 BrandsIntel Testing Guide

Test the API before deploying.

---

## **Set Up Local Environment**

### **1. Install Node.js**
```bash
# Download from https://nodejs.org/ (v18 or later)
# Verify installation:
node --version
npm --version
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Create .env File**
```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env and add your keys:
CLAUDE_API_KEY=sk-ant-xxxxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJxxx...
PORT=3000
NODE_ENV=development
```

### **4. Start Backend**
```bash
npm start
# Or with auto-reload:
npm run dev
```

You should see:
```
🚀 BrandsIntel API running on port 3000
📊 Verification endpoint: POST http://localhost:3000/api/verify
```

---

## **Test 1: Health Check**

**What it tests:** Backend is running

```bash
curl http://localhost:3000/api/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

## **Test 2: Verify a Business**

**What it tests:** Complete verification pipeline with Claude AI

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Jumia Nigeria",
    "website": "jumia.com.ng",
    "socialHandle": "@jumia"
  }'
```

**Expected response:**
```json
{
  "businessName": "Jumia Nigeria",
  "trustScore": 85,
  "riskLevel": "established",
  "explanation": "Established business with valid domain, SSL certificate, and strong online presence.",
  "keyIndicators": [
    "Domain registered 10+ years ago",
    "Valid SSL certificate",
    "Strong web presence"
  ],
  "whyThisMatters": "Indicates a legitimate, professional operation.",
  "nextSteps": "Safe to transact with. Verify recipient details independently.",
  "confidenceScore": 92,
  "timestamp": "2024-01-15T10:35:20.456Z"
}
```

**If you get an error:**
- Check Supabase connection (SUPABASE_URL, SUPABASE_KEY)
- Check Claude API key is valid
- Check backend logs for details

---

## **Test 3: Verify a Payment Account**

**What it tests:** Payment account fraud detection

```bash
curl -X POST http://localhost:3000/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "ABC ELECTRONICS",
    "bank": "GTBank",
    "accountNumber": "0123456789"
  }'
```

**Expected response:**
```json
{
  "accountName": "ABC ELECTRONICS",
  "bank": "GTBank",
  "trustScore": 45,
  "riskLevel": "caution",
  "explanation": "Account name is vague. No matching registered business found.",
  "keyIndicators": [
    "Vague account naming pattern",
    "No verified business match"
  ],
  "shouldBlock": false,
  "timestamp": "2024-01-15T10:40:15.789Z"
}
```

---

## **Test 4: Submit a Report**

**What it tests:** User reporting system

```bash
curl -X POST http://localhost:3000/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Jumia Nigeria",
    "reportType": "non_delivery",
    "description": "Ordered laptop 2 weeks ago, item never arrived"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "reportId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Report submitted. Thank you for helping keep Nigerian commerce safe."
}
```

---

## **Test 5: Get Business Profile**

**What it tests:** Retrieve saved business data

```bash
curl http://localhost:3000/api/business/Jumia%20Nigeria
```

**Expected response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "business_name": "Jumia Nigeria",
  "website": "jumia.com.ng",
  "social_handle": "@jumia",
  "verified": false,
  "created_at": "2024-01-15T10:35:20.456Z",
  "updated_at": "2024-01-15T10:35:20.456Z",
  "risk_profiles": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "business_id": "123e4567-e89b-12d3-a456-426614174000",
      "trust_score": 85,
      "risk_level": "established",
      "explanation": "...",
      "generated_at": "2024-01-15T10:35:20.456Z"
    }
  ]
}
```

---

## **Test 6: Get Business Reports**

**What it tests:** Retrieve all reports for a business

First, get the business ID from Test 5, then:

```bash
curl http://localhost:3000/api/business/123e4567-e89b-12d3-a456-426614174000/reports
```

**Expected response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440111",
    "business_id": "123e4567-e89b-12d3-a456-426614174000",
    "business_name": "Jumia Nigeria",
    "report_type": "non_delivery",
    "description": "Ordered laptop 2 weeks ago, item never arrived",
    "severity": "medium",
    "status": "pending",
    "created_at": "2024-01-15T10:45:10.123Z"
  }
]
```

---

## **Test 7: Business Verify/Claim Profile**

**What it tests:** Business registration flow

```bash
curl -X POST http://localhost:3000/api/business/verify \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "ABC Electronics",
    "website": "https://abc-electronics.com",
    "email": "contact@abc-electronics.com",
    "verificationCode": "123456"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Business verified successfully",
  "businessId": "550e8400-e29b-41d4-a716-446655440222"
}
```

---

## **Using Postman (Easier UI)**

If you prefer a GUI:

1. Download Postman: https://www.postman.com/downloads/
2. Create new collection: "BrandsIntel"
3. Add these requests:

```
Test 1: Health
  GET http://localhost:3000/api/health

Test 2: Verify Business
  POST http://localhost:3000/api/verify
  Body (JSON):
  {
    "businessName": "Jumia Nigeria",
    "website": "jumia.com.ng"
  }

Test 3: Verify Payment
  POST http://localhost:3000/api/verify-payment
  Body (JSON):
  {
    "accountName": "ABC ELECTRONICS",
    "bank": "GTBank",
    "accountNumber": "0123456789"
  }

Test 4: Submit Report
  POST http://localhost:3000/api/reports
  Body (JSON):
  {
    "businessName": "Jumia Nigeria",
    "reportType": "non_delivery",
    "description": "Item never arrived"
  }
```

4. Click "Send" on each request
5. Review responses

---

## **Performance Testing**

Test speed and capacity:

```bash
# Single request (should take ~1-2 seconds)
time curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test"}'

# Expected: 1.5-2.5 seconds
```

---

## **Load Testing** (Advanced)

Install Apache Bench:

```bash
# macOS
brew install httpd

# Ubuntu
sudo apt-get install apache2-utils
```

Test:

```bash
# 100 requests, 10 concurrent
ab -n 100 -c 10 \
  -p data.json \
  -T application/json \
  http://localhost:3000/api/health
```

---

## **Database Testing**

Verify database is connected:

```bash
# In the Node.js terminal, this should log:
# "Connected to Supabase successfully"
```

Check Supabase directly:

1. Go to https://supabase.com → Your Project
2. Click "SQL Editor"
3. Run: `SELECT COUNT(*) FROM businesses;`
4. Should return the number of businesses you've added

---

## **Error Scenarios to Test**

### **Missing Required Fields**

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{}'
```

Should return: `400 Business name is required`

---

### **Invalid Business Name (SQL Injection Attempt)**

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "ABC\"; DROP TABLE businesses; --"
  }'
```

Should be safely handled by Supabase (no data loss, safe return)

---

### **Invalid Account Number**

```bash
curl -X POST http://localhost:3000/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "TEST",
    "bank": "TestBank",
    "accountNumber": "123"
  }'
```

Should return: Risk assessment with "Invalid account number format" indicator

---

## **Debugging Tips**

### **Enable Verbose Logging**

Edit `brandsintel-backend.js` and add:

```javascript
// After creating app instance
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  console.log('Body:', req.body);
  next();
});
```

### **Check Database Connection**

```javascript
// Add to the top of brandsintel-backend.js
(async () => {
  const { data, error } = await supabase
    .from('businesses')
    .select('COUNT(*)');
  if (error) console.error('DB Error:', error);
  else console.log('DB Connected:', data);
})();
```

### **Test Claude API Directly**

```bash
curl https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $CLAUDE_API_KEY" \
  -d '{
    "model": "claude-opus-4-1",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

---

## **Checklist Before Deploying**

- [ ] Test 1: Health check passes
- [ ] Test 2: Business verification works
- [ ] Test 3: Payment verification works
- [ ] Test 4: Reports submission works
- [ ] Test 5: Retrieve business profile works
- [ ] Test 6: Retrieve reports works
- [ ] Test 7: Business claim verification works
- [ ] No errors in logs
- [ ] Response times < 3 seconds
- [ ] Database has saved data
- [ ] All .env variables are set
- [ ] No hardcoded secrets in code

Once all pass → You're ready to deploy! ✅

---

## **Next: Deploy to Render**

See `DEPLOYMENT_GUIDE.md` Phase 4.
