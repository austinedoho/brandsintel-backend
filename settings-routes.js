/**
 * BrandsIntel Settings Routes
 * Handles pricing updates and platform configuration
 * Admin-only endpoints
 */

const express = require('express');

const router = express.Router();

/**
 * GET /api/settings/pricing
 * Get all current pricing
 */
router.get('/pricing', async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;

    const { data: pricing, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'pricing')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Default pricing if not set
    const defaultPricing = {
      basic: {
        name: 'Basic',
        monthlyFee: 30000,
        features: [
          'Profile verification',
          'Basic monitoring',
        ],
      },
      pro: {
        name: 'Pro',
        monthlyFee: 50000,
        features: [
          'Profile verification',
          'Advanced monitoring',
          'API access',
        ],
      },
      enterprise: {
        name: 'Enterprise',
        monthlyFee: null,
        features: [
          'Everything',
          'Dedicated support',
          'White-label',
        ],
      },
    };

    res.json({
      pricing: pricing?.value || defaultPricing,
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({
      error: 'Failed to fetch pricing',
    });
  }
});

/**
 * POST /api/settings/pricing/update
 * Update pricing tiers
 * Admin only
 */
router.post('/pricing/update', async (req, res) => {
  try {
    // In production, add authentication check here
    const { plan, monthlyFee, features } = req.body;

    if (!plan || !monthlyFee) {
      return res.status(400).json({
        error: 'Missing plan or monthlyFee',
      });
    }

    const supabase = req.app.locals.supabase;

    // Get current pricing
    const { data: currentPricing } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'pricing')
      .single();

    let pricing = currentPricing?.value || {};

    // Update specific plan
    pricing[plan] = {
      ...pricing[plan],
      monthlyFee,
      features: features || pricing[plan]?.features || [],
    };

    // Save updated pricing
    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          key: 'pricing',
          value: pricing,
          updated_at: new Date(),
        },
        { onConflict: 'key' }
      );

    if (error) throw error;

    res.json({
      success: true,
      message: `Pricing updated for ${plan} plan`,
      pricing,
    });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({
      error: 'Failed to update pricing',
    });
  }
});

/**
 * GET /api/settings/bot
 * Get WhatsApp bot configuration
 */
router.get('/bot', async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;

    const { data: botSettings, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'whatsapp_bot')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const defaultBot = {
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '+234 XXX XXXX XXXX',
      webhookUrl: `${process.env.API_BASE}/whatsapp/webhook`,
      status: process.env.TWILIO_WHATSAPP_NUMBER ? 'connected' : 'not_configured',
    };

    res.json({
      bot: botSettings?.value || defaultBot,
    });
  } catch (error) {
    console.error('Error fetching bot settings:', error);
    res.status(500).json({
      error: 'Failed to fetch bot settings',
    });
  }
});

/**
 * POST /api/settings/bot/update
 * Update WhatsApp bot settings
 * Admin only
 */
router.post('/bot/update', async (req, res) => {
  try {
    const { whatsappNumber, webhookUrl } = req.body;

    const supabase = req.app.locals.supabase;

    const botSettings = {
      whatsappNumber: whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER,
      webhookUrl: webhookUrl || `${process.env.API_BASE}/whatsapp/webhook`,
      status: 'connected',
      updatedAt: new Date(),
    };

    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          key: 'whatsapp_bot',
          value: botSettings,
          updated_at: new Date(),
        },
        { onConflict: 'key' }
      );

    if (error) throw error;

    res.json({
      success: true,
      message: 'Bot settings updated',
      bot: botSettings,
    });
  } catch (error) {
    console.error('Error updating bot settings:', error);
    res.status(500).json({
      error: 'Failed to update bot settings',
    });
  }
});

/**
 * GET /api/settings/api-keys
 * Get API key configuration (masked)
 */
router.get('/api-keys', (req, res) => {
  try {
    const maskedKeys = {
      claude: process.env.CLAUDE_API_KEY ? '●'.repeat(20) : 'Not configured',
      supabase: process.env.SUPABASE_KEY ? '●'.repeat(20) : 'Not configured',
      twilio: process.env.TWILIO_ACCOUNT_SID
        ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 2)}●●●●●●●●●●`
        : 'Not configured',
      paystack: process.env.PAYSTACK_SECRET_KEY ? '●'.repeat(20) : 'Not configured',
    };

    res.json({
      apiKeys: maskedKeys,
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      error: 'Failed to fetch API keys',
    });
  }
});

/**
 * GET /api/settings/all
 * Get all settings (admin view)
 */
router.get('/all', async (req, res) => {
  try {
    const supabase = req.app.locals.supabase;

    const { data: allSettings, error } = await supabase
      .from('settings')
      .select('*');

    if (error) throw error;

    const settings = {};
    allSettings.forEach((s) => {
      settings[s.key] = s.value;
    });

    res.json({
      settings,
    });
  } catch (error) {
    console.error('Error fetching all settings:', error);
    res.status(500).json({
      error: 'Failed to fetch settings',
    });
  }
});

module.exports = router;
