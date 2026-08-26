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

// Initialize Supabase - DISABLE REALTIME for Render compatibility
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: false
});

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

  // Determine risk level
  let riskLevel = 'established';
  if (trustScore >= 85) {
    riskLevel = 'established';
  } else if (trustScore >= 70) {
    riskLevel = 'caution';
  } else if (trustScore >= 50) {
    riskLevel = 'elevated_risk';
  } else {
    riskLevel = 'high_risk';
  }

  return { trustScore: Math.round(trustScore), riskLevel };
}

function calculateCAC_Score(company) {
  if (!company.cac_registered) return 0;
  if (!company.cac_number) return 20;
  
  // Check if CAC is recent (last 5 years)
  const cacAge = company.cac_year ? new Date().getFullYear() - company.cac_year : 10;
  if (cacAge <= 5) return 100;
  if (cacAge <= 10) return 80;
  return 50;
}

function calculateNewsScore(company, newsArticles = []) {
  if (newsArticles.length === 0) return 50;
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  newsArticles.forEach(article => {
    if (article.sentiment === 'positive') positiveCount++;
    if (article.sentiment === 'negative') negativeCount++;
  });
  
  const ratio = positiveCount / (positiveCount + negativeCount);
  return ratio * 100;
}

function calculateReviewsScore(company, reviews = []) {
  if (reviews.length === 0) return 50;
  
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return (avgRating / 5) * 100;
}

function calculateAgeScore(company) {
  const founded = company.founded_year || new Date().getFullYear();
  const age = new Date().getFullYear() - founded;
  
  if (age >= 10) return 100;
  if (age >= 5) return 85;
  if (age >= 2) return 60;
  if (age >= 1) return 40;
  return 20;
}

function calculateSocialScore(company, socialMetrics = {}) {
  const linkedin = socialMetrics.linkedin_followers || 0;
  const twitter = socialMetrics.twitter_followers || 0;
  const instagram = socialMetrics.instagram_followers || 0;
  
  const totalFollowers = linkedin + twitter + instagram;
  
  if (totalFollowers >= 100000) return 100;
  if (totalFollowers >= 10000) return 85;
  if (totalFollowers >= 1000) return 70;
  if (totalFollowers >= 100) return 50;
  return 20;
}

function calculateEmployeesScore(company) {
  const employees = company.employees || 0;
  
  if (employees >= 1000) return 100;
  if (employees >= 500) return 90;
  if (employees >= 100) return 80;
  if (employees >= 10) return 60;
  if (employees >= 1) return 40;
  return 20;
}

// ==================== WHATSAPP MESSAGE HANDLERS ====================

async function handleCheckCommand(companyName, phoneNumber) {
  try {
    // Search database for company
    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', `%${companyName}%`)
      .single();

    if (error || !company) {
      return `❌ *${companyName}* not found in our database.\n\nTry:\n• Check Jumia\n• Check Paystack\n• Check MTN Nigeria\n\nOr type HELP`;
    }

    // Calculate trust score
    const { trustScore, riskLevel } = calculateTrustScore(company);

    // Log verification
    await supabase.from('verification_activity').insert([{
      phone_number: phoneNumber,
      business_id: company.id,
      business_name: company.name,
      trust_score: trustScore,
      created_at: new Date()
    }]);

    // Format response
    let emoji = '';
    let status = '';
    
    if (trustScore >= 85) {
      emoji = '✅';
      status = 'VERIFIED - High Trust';
    } else if (trustScore >= 70) {
      emoji = '🟡';
      status = 'CAUTION - Medium Trust';
    } else {
      emoji = '⚠️';
      status = 'ALERT - Low Trust';
    }

    return `${emoji} *${company.name}*\n\n📊 Trust Score: ${trustScore}/100\n🏷️ Status: ${status}\n🏢 CAC: ${company.cac_number || 'N/A'}\n🌐 Website: ${company.website || 'N/A'}\n📍 Address: ${company.address || 'N/A'}\n\nReply:\n• Check [company] - Verify another\n• Help - More commands`;
  } catch (error) {
    console.error('Check command error:', error);
    return '⚠️ Error checking business. Please try again.';
  }
}

async function handleVerifyCommand(businessName, phoneNumber) {
  try {
    return `🔐 *Seller Verification*\n\n✓ Costs: ₦30,000/month\n✓ Get Verified Badge\n✓ Higher Trust Score\n✓ Appear in Searches\n\nBusiness: ${businessName}\n\n👉 Reply YES to start verification\n👉 Reply NO to cancel\n\nYour Phone: ${phoneNumber}`;
  } catch (error) {
    console.error('Verify command error:', error);
    return '⚠️ Error processing verification.';
  }
}

async function handleJobCommand(companyName, phoneNumber) {
  try {
    // Search for company
    const { data: company, error } = await supabase
      .from('companies')
      .select('name, trust_score, verification_status')
      .ilike('name', `%${companyName}%`)
      .single();

    if (error || !company) {
      return `⚠️ No records found for "${companyName}"\n\n🚨 Be Extra Careful!\nThis could be a job scam.\n\n✓ Never pay upfront fees\n✓ Ask for interview link\n✓ Verify company website\n✓ Check official email`;
    }

    if (company.verification_status === 'verified' || company.trust_score >= 80) {
      return `✅ *${company.name}* is a Verified Company\n\nTrust Score: ${company.trust_score}/100\n\n✓ Generally safe to apply\n✓ But always verify:\n   • Official email domain\n   • Company website\n   • Phone number\n\nStay safe! 🔒`;
    } else {
      return `🟡 *${company.name}* - Limited Info\n\nTrust Score: ${company.trust_score}/100\n\n⚠️ Be Cautious:\n   • Verify company website\n   • Check official email\n   • Never pay upfront\n   • Ask for interview link\n\nReport scams: Reply REPORT`;
    }
  } catch (error) {
    console.error('Job command error:', error);
    return '⚠️ Error checking job. Please try again.';
  }
}

function handleHelpCommand() {
  return `*brandstrack Bot Help* 🤖\n\n📍 *CHECK* - Verify any business\nUsage: Check Jumia\nGets: Trust score, CAC, website\n\n🏢 *VERIFY* - Get verified seller badge\nUsage: Verify My Business\nCost: ₦30,000/month\n\n💼 *JOB* - Check if job offer is real\nUsage: Job Google Nigeria\nGets: Company info, safety tips\n\n*Quick Tips:*\n✓ Never pay for job applications\n✓ Always verify company website\n✓ Check email domain carefully\n\n📞 Contact: hello@brandstrack.com`;
}

function handleMenuCommand() {
  return `*brandstrack Menu* 📋\n\n1️⃣ Check companies - Verify businesses\n2️⃣ Verify your business - Get badge\n3️⃣ Check job offers - Avoid scams\n4️⃣ Report scams - Help others\n5️⃣ Get support - Contact us\n\n*Quick Commands:*\n• Check [name] - Verify company\n• Verify [name] - Get badge\n• Job [name] - Check employer\n• Help - Full guide\n• Menu - This message\n\nPowered by brandstrack.com ✨`;
}

// ==================== WEBHOOK HANDLER ====================

router.post('/webhook', async (req, res) => {
  try {
    const { Body, From } = req.body;

    if (!Body || !From) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const message = Body.trim().toLowerCase();
    const phoneNumber = From.replace('whatsapp:', '');

    console.log(`📱 Message from ${phoneNumber}: ${Body}`);

    let response = '';

    // Route to appropriate handler
    if (message.startsWith('check ')) {
      const companyName = Body.substring(6).trim();
      response = await handleCheckCommand(companyName, phoneNumber);
    } 
    else if (message.startsWith('verify ')) {
      const businessName = Body.substring(7).trim();
      response = await handleVerifyCommand(businessName, phoneNumber);
    }
    else if (message.startsWith('job ')) {
      const companyName = Body.substring(4).trim();
      response = await handleJobCommand(companyName, phoneNumber);
    }
    else if (message === 'help') {
      response = handleHelpCommand();
    }
    else if (message === 'menu') {
      response = handleMenuCommand();
    }
    else {
      response = `Hi! 👋 Welcome to *brandstrack*\n\n📍 *Verify any Nigerian business instantly*\n\n*Commands:*\n• Check [company] - Get trust score\n• Verify [business] - Get verified badge\n• Job [company] - Check if job is real\n• Help - Show full guide\n\n*Example:* Check Jumia\n\nLet's keep Nigerian commerce safe! 🔒`;
    }

    // Send response back (for future Twilio integration)
    console.log(`📤 Response to ${phoneNumber}: ${response}`);

    res.json({
      success: true,
      message: 'Message processed',
      response: response
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ 
      error: 'Error processing message',
      details: error.message 
    });
  }
});

// ==================== HEALTH CHECK ====================

router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'WhatsApp bot is running',
    timestamp: new Date()
  });
});

module.exports = router;