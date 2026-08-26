// ============================================
// BRANDS TRACK - TRUST SCORE ALGORITHM
// Comprehensive company verification scoring
// ============================================

async function calculateTrustScore(company, additionalData = {}) {
  
  console.log(`\n🔍 Calculating trust score for: ${company.name}`);
  
  // Get individual scores
  const cacScore = calculateCAC_Score(company);
  const newsScore = calculateNewsScore(company, additionalData.newsArticles || []);
  const reviewsScore = calculateReviewsScore(company, additionalData.reviews || []);
  const ageScore = calculateAgeScore(company);
  const socialScore = calculateSocialScore(company, additionalData.socialMetrics || {});
  const employeesScore = calculateEmployeesScore(company);
  
  // Calculate weighted total
  const trustScore = 
    (cacScore * 0.30) +
    (newsScore * 0.20) +
    (reviewsScore * 0.25) +
    (ageScore * 0.10) +
    (socialScore * 0.10) +
    (employeesScore * 0.05);
  
  const finalScore = Math.min(Math.round(trustScore), 100);
  const badge = getTrustBadge(finalScore);
  
  // Log breakdown
  console.log(`\n📊 SCORE BREAKDOWN FOR: ${company.name}`);
  console.log(`   CAC Score (30%):      ${cacScore}/100`);
  console.log(`   News Score (20%):     ${newsScore}/100`);
  console.log(`   Reviews Score (25%):  ${reviewsScore}/100`);
  console.log(`   Age Score (10%):      ${ageScore}/100`);
  console.log(`   Social Score (10%):   ${socialScore}/100`);
  console.log(`   Employees Score (5%): ${employeesScore}/100`);
  console.log(`\n✅ FINAL TRUST SCORE: ${finalScore}/100 [${badge}]`);
  
  return {
    trustScore: finalScore,
    trustBadge: badge,
    breakdown: {
      cac: cacScore,
      news: newsScore,
      reviews: reviewsScore,
      age: ageScore,
      social: socialScore,
      employees: employeesScore
    },
    confidence: getConfidenceLevel(additionalData),
    recommendation: getRecommendation(finalScore)
  };
}

// ==================== 1. CAC REGISTRATION SCORE (30%) ====================
function calculateCAC_Score(company) {
  
  console.log(`   📋 CAC Score calculation...`);
  
  // Not registered with CAC = automatic fail
  if (!company.cac_number || company.cac_number === null) {
    console.log(`      ❌ No CAC number found: Score = 0`);
    return 0;
  }
  
  let score = 100; // Start at perfect
  
  // Check company status
  const status = company.status ? company.status.toUpperCase() : 'UNKNOWN';
  
  if (status === 'DISSOLVED') {
    score -= 100; // Company no longer exists
    console.log(`      ❌ Company dissolved: -100`);
  } else if (status === 'INACTIVE') {
    score -= 50; // Not operating
    console.log(`      ⚠️  Company inactive: -50`);
  } else if (status === 'SUSPENDED') {
    score -= 60; // Regulatory action
    console.log(`      ⚠️  Company suspended: -60`);
  } else if (status === 'ACTIVE') {
    console.log(`      ✅ Company active: +0`);
  }
  
  // Check company age
  if (company.registration_date) {
    const regDate = new Date(company.registration_date);
    const yearsActive = (new Date() - regDate) / (1000 * 60 * 60 * 24 * 365);
    
    if (yearsActive < 0.5) {
      score -= 25; // Very new
      console.log(`      ⚠️  Less than 6 months old: -25`);
    } else if (yearsActive < 1) {
      score -= 15; // Less than a year
      console.log(`      ⚠️  Less than 1 year old: -15`);
    } else if (yearsActive < 2) {
      score -= 5; // 1-2 years
      console.log(`      ✅ 1-2 years old: -5`);
    } else {
      console.log(`      ✅ ${yearsActive.toFixed(1)} years old: +0`);
    }
  }
  
  const finalCAC = Math.max(score, 0);
  console.log(`      Final CAC Score: ${finalCAC}`);
  return finalCAC;
}

// ==================== 2. NEWS SENTIMENT SCORE (20%) ====================
function calculateNewsScore(company, newsArticles = []) {
  
  console.log(`   📰 News Score calculation (${newsArticles.length} articles)...`);
  
  if (newsArticles.length === 0) {
    console.log(`      ⚪ No news articles found: Score = 50 (neutral)`);
    return 50; // Neutral if no news
  }
  
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  
  for (let article of newsArticles) {
    const text = (article.headline + ' ' + (article.summary || '')).toLowerCase();
    const sentiment = analyzeSentiment(text);
    
    if (sentiment === 'POSITIVE') positiveCount++;
    else if (sentiment === 'NEGATIVE') negativeCount++;
    else neutralCount++;
  }
  
  console.log(`      ✅ Positive: ${positiveCount}`);
  console.log(`      ❌ Negative: ${negativeCount}`);
  console.log(`      ⚪ Neutral:  ${neutralCount}`);
  
  // Calculate score
  // Positive news boosts score, negative news hurts heavily
  let score = 50; // Start at neutral
  score += (positiveCount * 3);   // +3 per positive article
  score -= (negativeCount * 5);   // -5 per negative article (fraud hurts more)
  score -= (neutralCount * 0.5);  // -0.5 per neutral
  
  const finalNews = Math.max(0, Math.min(100, score));
  console.log(`      Final News Score: ${finalNews}`);
  return finalNews;
}

// ==================== 3. CUSTOMER REVIEWS SCORE (25%) ====================
function calculateReviewsScore(company, reviews = []) {
  
  console.log(`   ⭐ Reviews Score calculation (${reviews.length} reviews)...`);
  
  if (reviews.length === 0) {
    console.log(`      ⚪ No reviews found: Score = 60 (unknown)`);
    return 60; // Unknown is slightly risky
  }
  
  // Calculate average rating
  const ratings = reviews.map(r => r.rating || 0);
  const averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  
  console.log(`      Average Rating: ${averageRating.toFixed(1)}/5`);
  
  // Convert 5-star to 0-100
  let score = (averageRating / 5) * 100;
  
  // Bonus for many reviews (shows legitimacy)
  if (reviews.length > 500) {
    score += 15;
    console.log(`      ✅ 500+ reviews: +15 (high legitimacy)`);
  } else if (reviews.length > 100) {
    score += 10;
    console.log(`      ✅ 100+ reviews: +10 (good legitimacy)`);
  } else if (reviews.length > 20) {
    score += 5;
    console.log(`      ✅ 20+ reviews: +5 (some legitimacy)`);
  }
  
  // Penalty for recent negative reviews
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentNegative = reviews
    .filter(r => new Date(r.date) > thirtyDaysAgo)
    .filter(r => r.rating <= 2)
    .length;
  
  if (recentNegative > 0) {
    score -= (recentNegative * 3);
    console.log(`      ❌ Recent negative reviews: ${recentNegative} × -3`);
  }
  
  const finalReviews = Math.max(0, Math.min(100, score));
  console.log(`      Final Reviews Score: ${finalReviews}`);
  return finalReviews;
}

// ==================== 4. COMPANY AGE SCORE (10%) ====================
function calculateAgeScore(company) {
  
  console.log(`   📅 Age Score calculation...`);
  
  if (!company.registration_date) {
    console.log(`      ⚪ No registration date: Score = 50`);
    return 50;
  }
  
  const registrationDate = new Date(company.registration_date);
  const yearsActive = (new Date() - registrationDate) / (1000 * 60 * 60 * 24 * 365);
  
  console.log(`      Company age: ${yearsActive.toFixed(1)} years`);
  
  let score = 0;
  
  if (yearsActive < 0.5) {
    score = 20;
    console.log(`      ⚠️  < 6 months: Score = 20`);
  } else if (yearsActive < 1) {
    score = 40;
    console.log(`      ⚠️  < 1 year: Score = 40`);
  } else if (yearsActive < 2) {
    score = 60;
    console.log(`      🟡 1-2 years: Score = 60`);
  } else if (yearsActive < 5) {
    score = 75;
    console.log(`      ✅ 2-5 years: Score = 75`);
  } else if (yearsActive < 10) {
    score = 90;
    console.log(`      ✅ 5-10 years: Score = 90`);
  } else {
    score = 100;
    console.log(`      ✅ 10+ years: Score = 100`);
  }
  
  return score;
}

// ==================== 5. SOCIAL MEDIA SCORE (10%) ====================
function calculateSocialScore(company, socialMetrics = {}) {
  
  console.log(`   📱 Social Media Score calculation...`);
  
  const hasTwitter = (socialMetrics.twitterFollowers || 0) > 0;
  const hasFacebook = (socialMetrics.facebookFollowers || 0) > 0;
  const hasLinkedIn = (socialMetrics.linkedinFollowers || 0) > 0;
  
  if (!hasTwitter && !hasFacebook && !hasLinkedIn) {
    console.log(`      ⚪ No social media presence: Score = 40`);
    return 40;
  }
  
  let score = 50;
  
  // Twitter
  if (socialMetrics.twitterFollowers > 50000) {
    score += 20;
    console.log(`      ✅ Twitter ${socialMetrics.twitterFollowers.toLocaleString()} followers: +20`);
  } else if (socialMetrics.twitterFollowers > 10000) {
    score += 15;
  } else if (socialMetrics.twitterFollowers > 1000) {
    score += 10;
  } else if (socialMetrics.twitterFollowers > 100) {
    score += 5;
  }
  
  // Facebook
  if (socialMetrics.facebookFollowers > 100000) {
    score += 20;
    console.log(`      ✅ Facebook ${socialMetrics.facebookFollowers.toLocaleString()} followers: +20`);
  } else if (socialMetrics.facebookFollowers > 50000) {
    score += 15;
  } else if (socialMetrics.facebookFollowers > 5000) {
    score += 10;
  } else if (socialMetrics.facebookFollowers > 500) {
    score += 5;
  }
  
  // LinkedIn
  if (socialMetrics.linkedinFollowers > 5000) {
    score += 15;
    console.log(`      ✅ LinkedIn ${socialMetrics.linkedinFollowers.toLocaleString()} followers: +15`);
  } else if (socialMetrics.linkedinFollowers > 1000) {
    score += 10;
  } else if (socialMetrics.linkedinFollowers > 100) {
    score += 5;
  }
  
  const finalSocial = Math.min(100, score);
  console.log(`      Final Social Score: ${finalSocial}`);
  return finalSocial;
}

// ==================== 6. EMPLOYEE COUNT SCORE (5%) ====================
function calculateEmployeesScore(company) {
  
  console.log(`   👥 Employee Count Score calculation...`);
  
  const employeeCount = company.employee_count || 0;
  
  console.log(`      Employees: ${employeeCount}`);
  
  let score = 0;
  
  if (employeeCount === 0) {
    score = 30;
    console.log(`      ⚪ No public employee data: Score = 30`);
  } else if (employeeCount < 5) {
    score = 40;
    console.log(`      ⚠️  1-4 employees: Score = 40`);
  } else if (employeeCount < 20) {
    score = 60;
    console.log(`      🟡 5-19 employees: Score = 60`);
  } else if (employeeCount < 100) {
    score = 75;
    console.log(`      ✅ 20-99 employees: Score = 75`);
  } else if (employeeCount < 500) {
    score = 90;
    console.log(`      ✅ 100-499 employees: Score = 90`);
  } else {
    score = 100;
    console.log(`      ✅ 500+ employees: Score = 100`);
  }
  
  return score;
}

// ==================== HELPER FUNCTIONS ====================

function analyzeSentiment(text) {
  
  const positiveWords = [
    'growth', 'success', 'excellent', 'award', 'expansion', 'profit',
    'innovation', 'leading', 'trusted', 'verified', 'legitimate',
    'partnership', 'achieved', 'launched', 'milestone', 'award',
    'certified', 'excellent', 'outstanding', 'approved', 'approved'
  ];
  
  const negativeWords = [
    'fraud', 'scam', 'lawsuit', 'collapsed', 'bankrupt', 'complaint',
    'scandal', 'arrest', 'shutdown', 'fake', 'deceive', 'stolen',
    'defaulted', 'suspended', 'terminated', 'violation', 'fine',
    'warning', 'closure', 'illegal', 'penalty', 'investigated'
  ];
  
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

function getConfidenceLevel(additionalData) {
  let confidence = 50; // Base confidence
  
  if (additionalData.newsArticles && additionalData.newsArticles.length > 5) confidence += 15;
  if (additionalData.reviews && additionalData.reviews.length > 20) confidence += 15;
  if (additionalData.socialMetrics) confidence += 10;
  
  return Math.min(100, confidence);
}

// ==================== EXPORT ====================
module.exports = {
  calculateTrustScore,
  getTrustBadge,
  getRecommendation
};