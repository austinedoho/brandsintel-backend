// ============================================
// BRANDS TRACK - NEWS SCRAPER
// Fetches and analyzes news articles about companies
// ============================================

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const NEWS_API_KEY = '360cee0702dd4e5589f019d6f5033760'; // Replace with your key
const SUPABASE_URL = 'https://edgxorvnddazggvrxixs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ3hvcnZuZGRhemdndnJ4aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MTkyNjcsImV4cCI6MjEwMzA5NTI2N30.Efuu5i6ots0bgWrtg9E81dtZcyBH9g6zZouwO3RTRCc'; // Your Supabase key

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== FETCH NEWS FROM NEWSAPI ====================
async function fetchNewsForCompany(companyName) {
  
  console.log(`\n🔍 Fetching news for: ${companyName}`);
  
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(companyName);
    const url = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&language=en&apiKey=${NEWS_API_KEY}`;
    
    const options = {
      headers: {
        'User-Agent': 'Brands-Track/1.0 (https://brandstrack.com)'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.status === 'ok') {
            console.log(`   ✅ Found ${result.articles.length} articles`);
            resolve(result.articles || []);
          } else {
            console.log(`   ⚠️  API Error: ${result.message}`);
            resolve([]);
          }
        } catch (error) {
          console.log(`   ❌ Parse error: ${error.message}`);
          resolve([]);
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ Network error: ${error.message}`);
      resolve([]);
    });
  });
}

// ==================== ANALYZE SENTIMENT ====================
function analyzeSentiment(text) {
  
  const positiveWords = [
    'growth', 'success', 'excellent', 'award', 'expansion', 'profit',
    'innovation', 'leading', 'trusted', 'verified', 'legitimate',
    'partnership', 'achieved', 'launched', 'milestone', 'certified',
    'outstanding', 'approved', 'investment', 'funding', 'valuation',
    'record', 'breakthrough', 'victory', 'triumph', 'accomplished'
  ];
  
  const negativeWords = [
    'fraud', 'scam', 'lawsuit', 'collapsed', 'bankrupt', 'complaint',
    'scandal', 'arrest', 'shutdown', 'fake', 'deceive', 'stolen',
    'defaulted', 'suspended', 'terminated', 'violation', 'fine',
    'warning', 'closure', 'illegal', 'penalty', 'investigated',
    'fraud', 'forgery', 'theft', 'crime', 'criminal'
  ];
  
  const textLower = text.toLowerCase();
  
  const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
  const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
  
  if (negativeCount > positiveCount) return 'NEGATIVE';
  else if (positiveCount > negativeCount) return 'POSITIVE';
  else return 'NEUTRAL';
}

// ==================== STORE ARTICLES IN SUPABASE ====================
async function storeArticlesInSupabase(companyId, articles) {
  
  console.log(`   📊 Storing ${articles.length} articles in Supabase...`);
  
  if (articles.length === 0) {
    console.log(`   ⚠️  No articles to store`);
    return;
  }
  
  // Create news_articles table entries
  const newsData = articles.map(article => ({
    source: article.source.name,
    headline: article.title,
    summary: article.description,
    url: article.url,
    published_date: article.publishedAt,
    sentiment: analyzeSentiment(article.title + ' ' + (article.description || '')),
    image_url: article.urlToImage,
    author: article.author,
    created_at: new Date()
  }));
  
  // Insert into Supabase
  try {
    const { data, error } = await supabase
      .from('news_articles')
      .insert(newsData);
    
    if (error) {
      console.log(`   ❌ Supabase error: ${error.message}`);
    } else {
      console.log(`   ✅ Stored ${newsData.length} articles`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// ==================== MAIN SCRAPING FUNCTION ====================
async function scrapeNewsForAllCompanies(companies) {
  
  console.log('\n' + '='.repeat(60));
  console.log('📰 BRANDS TRACK - NEWS SCRAPING');
  console.log('='.repeat(60));
  
  for (let company of companies) {
    try {
      // Fetch news
      const articles = await fetchNewsForCompany(company.name);
      
      // Analyze sentiment
      if (articles.length > 0) {
        const posCount = articles.filter(a => 
          analyzeSentiment(a.title + ' ' + (a.description || '')) === 'POSITIVE'
        ).length;
        const negCount = articles.filter(a => 
          analyzeSentiment(a.title + ' ' + (a.description || '')) === 'NEGATIVE'
        ).length;
        
        console.log(`   📈 Sentiment: ${posCount} positive, ${negCount} negative`);
      }
      
      // Store in Supabase
      await storeArticlesInSupabase(company.id, articles);
      
      // Rate limiting (avoid hitting API limits)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error processing ${company.name}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ NEWS SCRAPING COMPLETE');
  console.log('='.repeat(60) + '\n');
}

// ==================== SCHEDULED JOB ====================
function scheduleNewsScrapingJob(companies, intervalHours = 6) {
  
  console.log(`\n⏰ Scheduled news scraping every ${intervalHours} hours`);
  
  // Run immediately
  scrapeNewsForAllCompanies(companies);
  
  // Then run on interval
  setInterval(() => {
    scrapeNewsForAllCompanies(companies);
  }, intervalHours * 60 * 60 * 1000);
}

// ==================== EXPORT ====================
module.exports = {
  fetchNewsForCompany,
  analyzeSentiment,
  storeArticlesInSupabase,
  scrapeNewsForAllCompanies,
  scheduleNewsScrapingJob
};