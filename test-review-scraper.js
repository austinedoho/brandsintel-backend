const { scrapeReviewsForAllCompanies } = require('./review-scraper.js');

const testCompanies = [
  { id: '1', name: 'Jumia Nigeria' },
  { id: '2', name: 'Paystack' },
  { id: '3', name: 'Flutterwave' }
];

async function runTest() {
  console.log('Starting review scraper test...');
  await scrapeReviewsForAllCompanies(testCompanies);
  console.log('Test complete!');
}

runTest();