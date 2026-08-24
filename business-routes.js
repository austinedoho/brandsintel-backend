/**
 * BrandsIntel Business Routes
 * Handles business claims, verification, and management
 */

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

/**
 * POST /api/business/claim
 * Business owner claims their profile
 */
router.post('/claim', async (req, res) => {
  try {
    const { businessName, email, website, phone } = req.body;

    if (!businessName || !email) {
      return res.status(400).json({
        error: 'Missing required fields: businessName, email',
      });
    }

    const supabase = req.app.locals.supabase;

    // Check if business exists
    const { data: existingBusiness, error: searchError } = await supabase
      .from('businesses')
      .select('*')
      .eq('business_name', businessName)
      .single();

    if (searchError && searchError.code !== 'PGRST116') {
      throw searchError;
    }

    if (!existingBusiness) {
      return res.status(404).json({
        error: 'Business not found. Please ensure the business has been verified first.',
      });
    }

    // Generate verification code
    const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Create claim request
    const { data: claim, error: claimError } = await supabase
      .from('business_claims')
      .insert([
        {
          business_id: existingBusiness.id,
          email,
          website,
          phone,
          verification_code: verificationCode,
          status: 'pending',
          created_at: new Date(),
        },
      ])
      .select()
      .single();

    if (claimError) throw claimError;

    // TODO: Send email with verification code
    // sendVerificationEmail(email, verificationCode, businessName);

    res.json({
      success: true,
      message: 'Claim request submitted. Check your email for verification code.',
      claimId: claim.id,
      businessId: existingBusiness.id,
    });
  } catch (error) {
    console.error('Error claiming business:', error);
    res.status(500).json({
      error: 'Failed to claim business',
    });
  }
});

/**
 * POST /api/business/verify-claim
 * Verify business claim with code
 */
router.post('/verify-claim', async (req, res) => {
  try {
    const { claimId, verificationCode } = req.body;

    if (!claimId || !verificationCode) {
      return res.status(400).json({
        error: 'Missing claimId or verificationCode',
      });
    }

    const supabase = req.app.locals.supabase;

    // Find claim
    const { data: claim, error: claimError } = await supabase
      .from('business_claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return res.status(404).json({
        error: 'Claim not found',
      });
    }

    // Verify code
    if (claim.verification_code !== verificationCode) {
      return res.status(400).json({
        error: 'Invalid verification code',
      });
    }

    // Mark claim as verified
    const { error: updateError } = await supabase
      .from('business_claims')
      .update({
        status: 'verified',
        verified_at: new Date(),
      })
      .eq('id', claimId);

    if (updateError) throw updateError;

    // Update business as claimed
    const { error: bizError } = await supabase
      .from('businesses')
      .update({
        claimed_by_email: claim.email,
        verified: true,
        claimed_at: new Date(),
      })
      .eq('id', claim.business_id);

    if (bizError) throw bizError;

    res.json({
      success: true,
      message: 'Business claimed successfully!',
      businessId: claim.business_id,
    });
  } catch (error) {
    console.error('Error verifying claim:', error);
    res.status(500).json({
      error: 'Failed to verify claim',
    });
  }
});

/**
 * GET /api/business/claims/pending
 * Get all pending claims (admin)
 */
router.get('/claims/pending', async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;

    const { data: claims, error } = await supabase
      .from('business_claims')
      .select('*, businesses(business_name, website)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      claims,
      count: claims.length,
    });
  } catch (error) {
    console.error('Error fetching pending claims:', error);
    res.status(500).json({
      error: 'Failed to fetch claims',
    });
  }
});

/**
 * POST /api/business/subscribe
 * Subscribe a business to a plan (manual or after payment)
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { businessId, plan } = req.body;

    if (!businessId || !plan) {
      return res.status(400).json({
        error: 'Missing businessId or plan',
      });
    }

    const validPlans = ['basic', 'pro', 'enterprise'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        error: 'Invalid plan',
      });
    }

    const supabase = req.app.locals.supabase;

    // Calculate subscription end date
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Update business subscription
    const { data: business, error } = await supabase
      .from('businesses')
      .update({
        subscription_tier: plan,
        subscription_started: startDate,
        subscription_expires: endDate,
        verified: true,
      })
      .eq('id', businessId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Business subscribed to ${plan} plan`,
      business,
      subscriptionEnds: endDate,
    });
  } catch (error) {
    console.error('Error subscribing business:', error);
    res.status(500).json({
      error: 'Failed to subscribe business',
    });
  }
});

/**
 * GET /api/business/:businessId/subscription
 * Get business subscription info
 */
router.get('/:businessId/subscription', async (req, res) => {
  try {
    const { businessId } = req.params;

    const supabase = req.app.locals.supabase;

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, business_name, subscription_tier, subscription_started, subscription_expires, verified')
      .eq('id', businessId)
      .single();

    if (error || !business) {
      return res.status(404).json({
        error: 'Business not found',
      });
    }

    // Calculate days remaining
    const now = new Date();
    const expiresDate = new Date(business.subscription_expires);
    const daysRemaining = Math.ceil((expiresDate - now) / (1000 * 60 * 60 * 24));

    res.json({
      subscription: {
        businessId: business.id,
        businessName: business.business_name,
        tier: business.subscription_tier,
        verified: business.verified,
        startedAt: business.subscription_started,
        expiresAt: business.subscription_expires,
        daysRemaining: Math.max(0, daysRemaining),
        isActive: daysRemaining > 0,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription',
    });
  }
});

/**
 * POST /api/business/update-profile
 * Business updates their profile info
 */
router.post('/update-profile', async (req, res) => {
  try {
    const { businessId, website, email, phone, socialHandle } = req.body;

    if (!businessId) {
      return res.status(400).json({
        error: 'Missing businessId',
      });
    }

    const supabase = req.app.locals.supabase;

    const updateData = {};
    if (website) updateData.website = website;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (socialHandle) updateData.social_handle = socialHandle;
    updateData.updated_at = new Date();

    const { data: business, error } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', businessId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      business,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      error: 'Failed to update profile',
    });
  }
});

module.exports = router;
