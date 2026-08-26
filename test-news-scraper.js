// Test news scraper
const { scrapeNewsForAllCompanies } = require('./news-scraper.js');

// Sample companies to test
const testCompanies = [
  {
    id: '1',
    name: 'Jumia Nigeria'
  },
  {
    id: '2',
    name: 'Paystack'
  },
  {
    id: '3',
    name: 'Flutterwave'
  }
];

async function runTest() {
  console.log('Starting news scraper test...');
  await scrapeNewsForAllCompanies(testCompanies);
  console.log('Test complete!');
}

runTest();