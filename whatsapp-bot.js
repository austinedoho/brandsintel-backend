/**
 * BRANDS TRACK - WHATSAPP BOT
 * Complete implementation with Supabase + Trust Score Algorithm
 * Handles: Check, Verify, Job, Help commands
 */

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const router = express.Router();

// ==================== CONFIGURATION ====================

const TWILIO_PHONE_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+1234567890';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const SUPABASE_URL = 'https://edgxorvnddazggvrxixs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== TRUST SCORE ALGORITHM ====================

function calculateTrustScore(company, additionalData = {}) {
  
  // Individual scores
  const cacScore = calculateCAC_Score(company);
  const newsScore = calculateNewsScore(company, additionalData.newsArticles || []);
  const reviewsScore = calculateReviewsScore(company, additionalData.reviews || []);
  const ageScore = calculateAgeScore(company);
  const socialScore = calculateSocialScore(company, additionalData.socialMetrics || {});
  const employeesScore = calculateEmployeesScore(company);
  
  // Weighted total
  const trustScore = 
    (cacScore * 0.30) +
    (newsScore * 0.20) +
    (reviewsScore * 0.25) +
    (ageScore * 0.10) +
    (socialScore * 0.10) +
    (employeesScore * 0.05);
  
  const finalScore = Math.min(Math.round(trustScore), 100);
  const badge = getTrustBadge(finalScore);
  
  return {
    trustScore: finalScore,
    trustBadge: badge,
    recommendation: getRecommendation(finalScore),
    breakdown: { cac: cacScore, news: newsScore, reviews: reviewsScore, age: ageScore, social: socialScore, employees: employeesScore }
  };
}

function calculateCAC_Score(company) {
  if (!company.cac_number) return 0;
  
  let score = 100;
  const status = company.status ? company.status.toUpperCase() : 'UNKNOWN';
  
  if (status === 'DISSOLVED') score -= 100;
  else if (status === 'INACTIVE') score -= 50;
  else if (status === 'SUSPENDED') score -= 60;
  
  return Math.max(score, 0);
}

function calculateNewsScore(company, newsArticles = []) {
  if (newsArticles.length === 0) return 50;
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (let article of newsArticles) {
    const sentiment = analyzeSentiment(article.headline + ' ' + (article.summary || ''));
    if (sentiment === 'POSITIVE') positiveCount++;
    else if (sentiment === 'NEGATIVE') negativeCount++;
  }
  
  let score = 50 + (positiveCount * 3) - (negativeCount * 5);
  return Math.max(0, Math.min(100, score));
}

function calculateReviewsScore(company, reviews = []) {
  if (reviews.length === 0) return 60;
  
  const ratings = reviews.map(r => r.rating || 0);
  const averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  
  let score = (averageRating / 5) * 100;
  
  if (reviews.length > 100) score += 10;
  else if (reviews.length > 20) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

function calculateAgeScore(company) {
  if (!company.registration_date) return 50;
  
  const regDate = new Date(company.registration_date);
  const yearsActive = (new Date() - regDate) / (1000 * 60 * 60 * 24 * 365);
  
  if (yearsActive < 0.5) return 20;
  else if (yearsActive < 1) return 40;
  else if (yearsActive < 2) return 60;
  else if (yearsActive < 5) return 75;
  else if (yearsActive < 10) return 90;
  else return 100;
}

function calculateSocialScore(company, socialMetrics = {}) {
  const hasTwitter = (socialMetrics.twitterFollowers || 0) > 0;
  const hasFacebook = (socialMetrics.facebookFollowers || 0) > 0;
  const hasLinkedIn = (socialMetrics.linkedinFollowers || 0) > 0;
  
  if (!hasTwitter && !hasFacebook && !hasLinkedIn) return 40;
  
  let score = 50;
  
  if (socialMetrics.twitterFollowers > 10000) score += 15;
  else if (socialMetrics.twitterFollowers > 1000) score += 10;
  
  if (socialMetrics.facebookFollowers > 50000) score += 15;
  else if (socialMetrics.facebookFollowers > 5000) score += 10;
  
  if (socialMetrics.linkedinFollowers > 1000) score += 10;
  
  return Math.min(100, score);
}

function calculateEmployeesScore(company) {
  const employeeCount = company.employee_count || 0;
  
  if (employeeCount === 0) return 30;
  else if (employeeCount < 5) return 40;
  else if (employeeCount < 20) return 60;
  else if (employeeCount < 100) return 75;
  else if (employeeCount < 500) return 90;
  else return 100;
}

function analyzeSentiment(text) {
  const positiveWords = ['growth', 'success', 'excellent', 'award', 'expansion', 'profit', 'innovation', 'leading', 'trusted', 'verified'];
  const negativeWords = ['fraud', 'scam', 'lawsuit', 'collapsed', 'bankrupt', 'complaint', 'scandal', 'arrested', 'shutdown', 'fake'];
  
  const textLower = text.toLowerCase();
  const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
  const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
  
  if (negativeCount > positiveCount) return 'NEGATIVE';
  else if (positiveCount > negativeCount) return 'POSITIVE';
  else return 'NEUTRAL';
}

function getTrustBadge(score) {
  if (score >= 90) return '✅ VERIFIED';
  else if (score >= 75) return '🟡 CAUTION';
  else if (score >= 50) return '⚠️ ALERT';
  else return '🔴 DANGER';
}

function getRecommendation(score) {
  if (score >= 90) return 'Safe to do business. Company is verified and trustworthy.';
  else if (score >= 75) return 'Proceed with caution. Company is mostly legitimate but has minor concerns.';
  else if (score >= 50) return 'High risk. Research more before doing business.';
  else return 'Do not engage. Likely fraudulent or untrustworthy.';
}

// ==================== SUPABASE FUNCTIONS ====================

async function getCompanyFromSupabase(companyName) {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', `%${companyName}%`)
      .limit(1)
      .single();
    
    if (error) {
      console.log(`Company not found: ${companyName}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Supabase query error:', error.message);
    return null;
  }
}

async function getCompanyNews(companyId) {
  try {
    const { data, error } = await supabase
      .from('news_articles')
      .select('headline, summary, sentiment, published_date')
      .eq('company_id', companyId)
      .limit(10);
    
    if (error) return [];
    return data || [];
  } catch (error) {
    console.error('News query error:', error.message);
    return [];
  }
}

async function getCompanyReviews(companyId) {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('rating, review_text, review_date')
      .eq('company_id', companyId)
      .limit(20);
    
    if (error) return [];
    return data || [];
  } catch (error) {
    console.error('Reviews query error:', error.message);
    return [];
  }
}

// ==================== RESPONSE TEMPLATES ====================

function getWelcomeMessage() {
  return `👋 Welcome to Brands Track!

I help you verify Nigerian businesses instantly and safely.

🔍 WHAT I CAN DO:

📍 Check [company name]
   → Get instant trust score (0-100)
   → See CAC registration
   → Read latest news
   → View customer reviews

✅ Verify [your business]
   → Get verified badge
   → Build customer trust
   → ₦30,000/month

💼 Job [company name]
   → Check if job offer is REAL
   → Identify scams

EXAMPLES:
📍 Check Jumia
📍 Check Paystack
💼 Job Google

Ready? Try one now! 👇`;
}

function getHelpMessage() {
  return `📚 BRANDS TRACK - HELP MENU

🔍 VERIFY COMPANIES
Command: Check [company name]
Example: Check Jumia Nigeria
→ Get instant trust score
→ Know who you're dealing with

✅ VERIFY YOUR BUSINESS
Command: Verify
→ Get verified badge
→ Display on WhatsApp, Instagram
→ Build customer trust
→ ₦30,000/month

💼 CHECK JOB OFFERS
Command: Job [company name]
Example: Job Google
→ Is this a real job?
→ Don't get scammed!

What would you like to do? 👇`;
}

function formatCompanyResponse(company, score) {
  const badgeEmoji = score.trustScore >= 90 ? '✅' : score.trustScore >= 75 ? '🟡' : score.trustScore >= 50 ? '⚠️' : '🔴';
  
  const yearsActive = company.registration_date 
    ? Math.floor((new Date() - new Date(company.registration_date)) / (1000 * 60 * 60 * 24 * 365))
    : 'Unknown';
  
  return `${badgeEmoji} ${company.name.toUpperCase()}

🏢 Company Details
├─ CAC Number: ${company.cac_number || 'Not found'}
├─ Status: ${company.status || 'Unknown'}
├─ Founded: ${yearsActive !== 'Unknown' ? yearsActive + ' years ago' : 'Unknown'}
└─ Verified by CAC: ${company.cac_number ? '✅' : '❌'}

📊 TRUST SCORE: ${score.trustScore}/100 ${score.trustBadge}

🎯 RECOMMENDATION: ${score.recommendation}

${score.trustScore >= 90 ? '✅ Safe to do business with this company!' : score.trustScore >= 75 ? '🟡 Be cautious. Do your own verification.' : score.trustScore >= 50 ? '⚠️ High risk. Research more before proceeding.' : '🔴 Do NOT engage. Likely fraudulent.'}

---

💡 FOR SELLERS:
Get your business verified too!
Reply: Verify
Cost: ₦30,000/month

Need more info? Reply: Help`;
}

function formatJobResponse(company, score) {
  const trustLevel = score.trustScore >= 90 ? 'LEGITIMATE' : score.trustScore >= 75 ? 'MOSTLY LEGITIMATE' : 'SUSPICIOUS';
  
  return `💼 JOB VERIFICATION - ${company.name.toUpperCase()}

🏢 EMPLOYER: ${company.name}
├─ CAC: ${company.cac_number || 'Not registered'}
├─ Status: ${company.status || 'Unknown'}
└─ Trust Score: ${score.trustScore}/100

📊 JOB LEGITIMACY: ${score.trustScore}% REAL

${score.trustScore >= 90 ? '✅ This is likely a REAL job offer.' : score.trustScore >= 75 ? '🟡 Mostly legitimate, but verify independently.' : '🔴 SUSPICIOUS - Be very careful!'}

🎯 RECOMMENDATION: ${score.recommendation}

---

💡 BEFORE APPLYING:
1. ${score.trustScore >= 90 ? 'Apply confidently' : 'Verify on their official website'}
2. ${score.trustScore >= 90 ? 'Check company careers page' : 'Call their official number'}
3. Never send money upfront ❌

Need more info? Reply: Help`;
}

function formatNotFoundResponse(companyName) {
  return `❌ Company Not Found

I couldn't find "${companyName}" in my database.

This could mean:
- Company name is slightly different
- Not yet in CAC database
- Recently closed

💡 TRY THESE:

1️⃣ Search with full name:
   Check ${companyName} Limited

2️⃣ Try another spelling:
   Check [different spelling]

Still not finding it?
Reply: Help`;
}

function formatVerificationFlow() {
  return `💼 GET VERIFIED FOR YOUR BUSINESS

Increase trust. Increase sales. ✅

WHAT YOU GET:
✅ Verified badge on Brands Track
✅ CAC registration confirmation
✅ Higher trust score
✅ Display on WhatsApp bio
✅ Build customer confidence

COST: ₦30,000/month
(Cancel anytime)

NEXT STEP:
Reply: YES to get started
Reply: Help for more info`;
}

// ==================== TWILIO WEBHOOK ====================

async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: `whatsapp:${to}`,
        Body: message,
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
      }
    );
    console.log('✅ WhatsApp message sent:', response.data.sid);
    return true;
  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:', error.message);
    return false;
  }
}

router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  const incomingMessage = req.body.Body?.trim() || '';
  const senderPhone = req.body.From?.replace('whatsapp:', '') || '';

  console.log(`📱 Message from ${senderPhone}: "${incomingMessage}"`);

  // Respond to Twilio immediately
  res.status(200).send('OK');

  try {
    const messageUpper = incomingMessage.toUpperCase();
    let response = '';

    // ========== COMMAND: CHECK COMPANY ==========
    if (messageUpper.startsWith('CHECK ')) {
      const companyName = incomingMessage.replace(/^CHECK\s+/i, '').trim();

      if (companyName.length < 2) {
        await sendWhatsAppMessage(senderPhone, '❌ Please provide a company name.\n\nExample: "Check Jumia"');
        return;
      }

      console.log(`🔍 Checking company: ${companyName}`);

      // Get company from Supabase
      const company = await getCompanyFromSupabase(companyName);

      if (!company) {
        response = formatNotFoundResponse(companyName);
      } else {
        // Get additional data
        const news = await getCompanyNews(company.id);
        const reviews = await getCompanyReviews(company.id);

        // Calculate trust score
        const trustScore = calculateTrustScore(company, {
          newsArticles: news,
          reviews: reviews
        });

        response = formatCompanyResponse(company, trustScore);
      }
    }

    // ========== COMMAND: CHECK JOB ==========
    else if (messageUpper.startsWith('JOB ')) {
      const companyName = incomingMessage.replace(/^JOB\s+/i, '').trim();

      if (companyName.length < 2) {
        await sendWhatsAppMessage(senderPhone, '❌ Please provide a company name.\n\nExample: "Job Google"');
        return;
      }

      console.log(`💼 Checking job at: ${companyName}`);

      const company = await getCompanyFromSupabase(companyName);

      if (!company) {
        response = formatNotFoundResponse(companyName);
      } else {
        const news = await getCompanyNews(company.id);
        const reviews = await getCompanyReviews(company.id);
        const trustScore = calculateTrustScore(company, { newsArticles: news, reviews: reviews });
        response = formatJobResponse(company, trustScore);
      }
    }

    // ========== COMMAND: VERIFY BUSINESS ==========
    else if (messageUpper === 'VERIFY') {
      response = formatVerificationFlow();
    }

    // ========== COMMAND: HELP ==========
    else if (messageUpper === 'HELP' || messageUpper === 'START' || messageUpper === 'HI' || messageUpper === 'HELLO') {
      response = getHelpMessage();
    }

    // ========== COMMAND: NOT RECOGNIZED ==========
    else {
      response = `❓ I didn't understand that.

Try these commands:
📍 Check [company name]
   Example: Check Jumia

💼 Job [company name]
   Example: Job Google

✅ Verify
   Get your business verified

📖 Help
   See all commands

What would you like to do? 👇`;
    }

    // Send response
    if (response) {
      await sendWhatsAppMessage(senderPhone, response);
    }

  } catch (error) {
    console.error('❌ Error processing message:', error.message);
    await sendWhatsAppMessage(senderPhone, '⚠️ Something went wrong. Please try again.');
  }
});

// ==================== EXPORT ====================

module.exports = router;