// Test the trust score algorithm
const { calculateTrustScore } = require('./trust-score-algorithm.js');

// Sample company 1: Jumia Nigeria (Good company)
const jumia = {
  name: 'Jumia Nigeria',
  cac_number: 'CAC-BN-12345',
  registration_date: '2012-06-15',
  status: 'ACTIVE',
  employee_count: 500
};

// Sample company 2: Unknown Company (Suspicious)
const unknown = {
  name: 'Unknown Trading Ltd',
  cac_number: null, // NOT registered
  registration_date: '2024-01-01',
  status: 'UNKNOWN',
  employee_count: 0
};

// Sample company 3: Paystack (Excellent)
const paystack = {
  name: 'Paystack',
  cac_number: 'CAC-BN-54321',
  registration_date: '2015-03-01',
  status: 'ACTIVE',
  employee_count: 200
};

// Test data with news and reviews
const jumpiaWithData = {
  ...jumia,
  newsArticles: [
    { headline: 'Jumia achieves profitability milestone', summary: 'Growth success' },
    { headline: 'Jumia expands to 5 new African countries', summary: 'Expansion news' },
    { headline: 'Jumia awarded best e-commerce platform', summary: 'Award success' }
  ],
  reviews: [
    { rating: 4.5, date: new Date() },
    { rating: 4.2, date: new Date() },
    { rating: 4.8, date: new Date() },
    { rating: 4.1, date: new Date() },
    { rating: 4.3, date: new Date() }
  ],
  socialMetrics: {
    twitterFollowers: 50000,
    facebookFollowers: 200000,
    linkedinFollowers: 10000
  }
};

// Run tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 BRANDS TRACK TRUST SCORE - ALGORITHM TESTS');
  console.log('='.repeat(60));
  
  console.log('\n\n📍 TEST 1: Jumia Nigeria (with full data)');
  console.log('='.repeat(60));
  const jumiaResult = await calculateTrustScore(jumia, {
    newsArticles: jumpiaWithData.newsArticles,
    reviews: jumpiaWithData.reviews,
    socialMetrics: jumpiaWithData.socialMetrics
  });
  console.log(`\n🎯 FINAL RESULT: ${jumiaResult.trustScore}/100 [${jumiaResult.trustBadge}]`);
  console.log(`📝 Recommendation: ${jumiaResult.recommendation}`);
  
  console.log('\n\n📍 TEST 2: Unknown Company (no CAC, no data)');
  console.log('='.repeat(60));
  const unknownResult = await calculateTrustScore(unknown);
  console.log(`\n🎯 FINAL RESULT: ${unknownResult.trustScore}/100 [${unknownResult.trustBadge}]`);
  console.log(`📝 Recommendation: ${unknownResult.recommendation}`);
  
  console.log('\n\n📍 TEST 3: Paystack (established, minimal data)');
  console.log('='.repeat(60));
  const paystackResult = await calculateTrustScore(paystack, {
    newsArticles: [
      { headline: 'Paystack valued at $1.5B - successful funding round', summary: 'Major success' }
    ],
    reviews: [
      { rating: 4.7, date: new Date() },
      { rating: 4.9, date: new Date() },
      { rating: 4.6, date: new Date() }
    ]
  });
  console.log(`\n🎯 FINAL RESULT: ${paystackResult.trustScore}/100 [${paystackResult.trustBadge}]`);
  console.log(`📝 Recommendation: ${paystackResult.recommendation}`);
  
  console.log('\n\n' + '='.repeat(60));
  console.log('✅ ALL TESTS COMPLETE');
  console.log('='.repeat(60) + '\n');
}

runTests();