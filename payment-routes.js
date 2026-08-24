/**
 * BrandsIntel Payment Routes
 * Handles payment processing, verification, and webhooks
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const paystack = require('./paystack-integration');

const router = express.Router();

// Pricing configuration
const PRICING = {
  basic: {
    name: 'Basic',
    amount: 30000 * 100, // ₦30,000 in kobo
    features: ['Profile verification', 'Basic monitoring'],
    monthlyFee: 30000,
  },
  pro: {
    name: 'Pro',
    amount: 50000 * 100, // ₦50,000 in kobo
    features: ['Profile verification', 'Advanced monitoring', 'API access'],
    monthlyFee: 50000,
  },
  enterprise: {
    name: 'Enterprise',
    amount: null, // Custom
    features: ['Everything', 'Dedicated support', 'White-label'],
    monthlyFee: 0, // Custom
  },
};

/**
 * POST /api/payments/initialize
 * Start a payment transaction
 */
router.post('/initialize', async (req, res) => {
  try {
    const { businessId, businessName, email, plan } = req.body;

    if (!businessId || !businessName || !email || !plan) {
      return res.status(400).json({
        error: 'Missing required fields: businessId, businessName, email, plan',
      });
    }

    if (!PRICING[plan]) {
      return res.status(400).json({
        error: 'Invalid plan. Must be: basic, pro, or enterprise',
      });
    }

    if (plan === 'enterprise') {
      return res.status(400).json({
        error: 'Enterprise plan requires manual setup. Contact support.',
      });
    }

    const reference = `BrandsIntel-${businessId}-${uuidv4()}`;

    const paymentInit = await paystack.initializePayment({
      email,
      amount: PRICING[plan].amount,
      reference,
      businessId,
      businessName,
      plan,
    });

    if (!paymentInit.success) {
      return res.status(400).json({
        error: paymentInit.error,
      });
    }

    // Store pending payment in database
    try {
      const supabase = req.app.locals.supabase;
      await supabase.from('payments').insert([
        {
          business_id: businessId,
          reference,
          plan,
          amount: PRICING[plan].monthlyFee,
          status: 'pending',
          email,
          initialized_at: new Date(),
        },
      ]);
    } catch (dbError) {
      console.error('Error storing payment record:', dbError);
      // Continue anyway - payment still initializes
    }

    res.json({
      success: true,
      authorizationUrl: paymentInit.authorizationUrl,
      reference,
      amount: PRICING[plan].monthlyFee,
      plan,
    });
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      error: 'Failed to initialize payment',
    });
  }
});

/**
 * GET /api/payments/verify/:reference
 * Verify payment status
 */
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const verification = await paystack.verifyPayment(reference);

    if (!verification.success) {
      return res.status(400).json({
        error: verification.error,
      });
    }

    // If payment successful, update database
    if (verification.status === 'success') {
      try {
        const supabase = req.app.locals.supabase;
        const businessId = verification.metadata?.businessId;
        const plan = verification.metadata?.plan;

        // Update payment record
        await supabase
          .from('payments')
          .update({
            status: 'completed',
            paid_at: new Date(),
            transaction_id: reference,
          })
          .eq('reference', reference);

        // Update business subscription
        if (businessId && plan) {
          await supabase
            .from('businesses')
            .update({
              subscription_tier: plan,
              subscription_started: new Date(),
              subscription_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              verified: true,
            })
            .eq('id', businessId);
        }
      } catch (dbError) {
        console.error('Error updating business subscription:', dbError);
      }
    }

    res.json({
      success: true,
      status: verification.status,
      amount: verification.amount,
      reference: verification.reference,
      paidAt: verification.paidAt,
      businessId: verification.metadata?.businessId,
      plan: verification.metadata?.plan,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      error: 'Failed to verify payment',
    });
  }
});

/**
 * POST /api/payments/webhook
 * Paystack webhook endpoint
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const body = req.body;

    // Verify signature
    if (!paystack.verifyWebhookSignature(body, signature)) {
      return res.status(401).json({
        error: 'Invalid signature',
      });
    }

    const event = body.event;
    const data = body.data;

    if (event === 'charge.success') {
      // Payment successful
      console.log('✓ Payment received:', data.reference);

      try {
        const supabase = req.app.locals.supabase;
        const businessId = data.metadata?.businessId;
        const plan = data.metadata?.plan;

        if (businessId && plan) {
          // Update business to verified and premium
          await supabase
            .from('businesses')
            .update({
              subscription_tier: plan,
              subscription_started: new Date(),
              subscription_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              verified: true,
            })
            .eq('id', businessId);
        }
      } catch (dbError) {
        console.error('Error processing webhook:', dbError);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /api/payments/pricing
 * Get all pricing plans
 */
router.get('/pricing', (req, res) => {
  res.json({
    plans: {
      basic: PRICING.basic,
      pro: PRICING.pro,
      enterprise: PRICING.enterprise,
    },
  });
});

/**
 * POST /api/payments/confirm-payment
 * Manually confirm a payment (for testing)
 */
router.post('/confirm-payment', async (req, res) => {
  try {
    const { businessId, plan } = req.body;

    if (!businessId || !plan) {
      return res.status(400).json({
        error: 'Missing businessId or plan',
      });
    }

    const supabase = req.app.locals.supabase;

    // Update business subscription
    const { data, error } = await supabase
      .from('businesses')
      .update({
        subscription_tier: plan,
        subscription_started: new Date(),
        subscription_expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        verified: true,
      })
      .eq('id', businessId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Business upgraded to ${plan} plan`,
      business: data,
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      error: 'Failed to confirm payment',
    });
  }
});

module.exports = router;
