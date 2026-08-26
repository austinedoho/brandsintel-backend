// ============================================
// BRANDS TRACK - REVIEW SCRAPER
// Fetches reviews from Google Maps
// ============================================

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const GOOGLE_MAPS_API_KEY = 'AIzaSyCZNSEPLQc4TtOqiAcxMwT18uyDbDwPxAI'; // Replace
const SUPABASE_URL = 'https://edgxorvnddazggvrxixs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ3hvcnZuZGRhemdndnJ4aXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MTkyNjcsImV4cCI6MjEwMzA5NTI2N30.Efuu5i6ots0bgWrtg9E81dtZcyBH9g6zZouwO3RTRCc'; // Replace

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== SEARCH GOOGLE MAPS PLACE ====================
async function searchGoogleMapsPlace(companyName, location = 'Nigeria') {
  
  console.log(`\n🔍 Searching Google Maps for: ${companyName}`);
  
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(`${companyName} ${location}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const options = {
      headers: {
        'User-Agent': 'Brands-Track/1.0'
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
          
          if (result.results && result.results.length > 0) {
            const place = result.results[0];
            console.log(`   ✅ Found: ${place.name}`);
            resolve({
              place_id: place.place_id,
              name: place.name,
              rating: place.rating,
              review_count: place.user_ratings_total
            });
          } else {
            console.log(`   ❌ No results found`);
            resolve(null);
          }
        } catch (error) {
          console.log(`   ❌ Parse error: ${error.message}`);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ Network error: ${error.message}`);
      resolve(null);
    });
  });
}

// ==================== GET PLACE DETAILS & REVIEWS ====================
async function getPlaceDetails(placeId) {
  
  console.log(`   📍 Fetching place details and reviews...`);
  
  return new Promise((resolve, reject) => {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,photos&key=${GOOGLE_MAPS_API_KEY}`;
    
    const options = {
      headers: {
        'User-Agent': 'Brands-Track/1.0'
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
          
          if (result.result) {
            const place = result.result;
            console.log(`   ✅ Rating: ${place.rating}/5 (${place.user_ratings_total} reviews)`);
            console.log(`   ✅ Found ${place.reviews ? place.reviews.length : 0} recent reviews`);
            
            resolve({
              rating: place.rating,
              total_reviews: place.user_ratings_total,
              reviews: place.reviews || []
            });
          } else {
            console.log(`   ❌ Could not fetch details`);
            resolve(null);
          }
        } catch (error) {
          console.log(`   ❌ Parse error: ${error.message}`);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ Network error: ${error.message}`);
      resolve(null);
    });
  });
}

// ==================== ANALYZE REVIEW SENTIMENT ====================
function analyzeReviewSentiment(text) {
  
  const positiveWords = [
    'excellent', 'great', 'amazing', 'love', 'perfect', 'fantastic',
    'brilliant', 'awesome', 'wonderful', 'best', 'highly recommend',
    'satisfied', 'happy', 'impressed', 'quality', 'professional'
  ];
  
  const negativeWords = [
    'terrible', 'awful', 'bad', 'poor', 'hate', 'waste', 'scam',
    'fraud', 'disappointed', 'worst', 'useless', 'overpriced',
    'unprofessional', 'rude', 'broken', 'not worth'
  ];
  
  const textLower = text.toLowerCase();
  
  const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
  const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
  
  if (negativeCount > positiveCount) return 'NEGATIVE';
  else if (positiveCount > negativeCount) return 'POSITIVE';
  else return 'NEUTRAL';
}

// ==================== STORE REVIEWS IN SUPABASE ====================
async function storeReviewsInSupabase(reviews) {
  
  console.log(`   📊 Storing ${reviews.length} reviews in Supabase...`);
  
  if (reviews.length === 0) {
    console.log(`   ⚠️  No reviews to store`);
    return;
  }
  
  const reviewData = reviews.map(review => ({
    source: 'google_maps',
    reviewer_name: review.author_name,
    reviewer_url: review.author_url,
    rating: review.rating,
    review_text: review.text,
    review_date: review.time ? new Date(review.time * 1000) : new Date(),
    reviewer_image_url: review.profile_photo_url,
    created_at: new Date()
  }));
  
  try {
    const { data, error } = await supabase
      .from('reviews')
      .insert(reviewData);
    
    if (error) {
      console.log(`   ❌ Supabase error: ${error.message}`);
    } else {
      console.log(`   ✅ Stored ${reviewData.length} reviews`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// ==================== MAIN FUNCTION ====================
async function scrapeReviewsForAllCompanies(companies) {
  
  console.log('\n' + '='.repeat(60));
  console.log('⭐ BRANDS TRACK - REVIEW SCRAPER');
  console.log('='.repeat(60));
  
  for (let company of companies) {
    try {
      // Search for place
      const placeResult = await searchGoogleMapsPlace(company.name);
      
      if (!placeResult) {
        console.log(`   ⚠️  Could not find ${company.name} on Google Maps`);
        continue;
      }
      
      // Get details and reviews
      const details = await getPlaceDetails(placeResult.place_id);
      
      if (details && details.reviews.length > 0) {
        // Store reviews
        await storeReviewsInSupabase(details.reviews);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error processing ${company.name}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ REVIEW SCRAPING COMPLETE');
  console.log('='.repeat(60) + '\n');
}

// ==================== EXPORT ====================
module.exports = {
  searchGoogleMapsPlace,
  getPlaceDetails,
  analyzeReviewSentiment,
  storeReviewsInSupabase,
  scrapeReviewsForAllCompanies
};