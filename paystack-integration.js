/**
 * BrandsIntel Paystack Integration
 * Handles all payment processing with Paystack API
 * Production-ready code
 */

const axios = require('axios');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

/**
 * Initialize Paystack Payment
 * Creates a payment transaction
 */
async function initializePayment(paymentData) {
  try {
    const {
      email,
      amount, // in kobo (₦100 = 10000 kobo)
      reference,
      businessName,
      businessId,
      plan, // 'basic', 'pro', 'enterprise'
      metadata = {},
    } = paymentData;

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount,
        reference,
        metadata: {
          businessId,
          businessName,
          plan,
          ...metadata,
        },
        callback_url: `${process.env.API_BASE}/api/payments/verify`,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      authorizationUrl: response.data.data.authorization_url,
      accessCode: response.data.data.access_code,
      reference: response.data.data.reference,
    };
  } catch (error) {
    console.error('Paystack initialization error:', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Verify Paystack Payment
 * Checks if payment was successful
 */
async function verifyPayment(reference) {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const transaction = response.data.data;

    return {
      success: true,
      status: transaction.status,
      amount: transaction.amount / 100, // Convert kobo to naira
      reference: transaction.reference,
      paidAt: transaction.paid_at,
      metadata: transaction.metadata,
      message: transaction.gateway_response,
    };
  } catch (error) {
    console.error('Paystack verification error:', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Get Transaction Details
 * Retrieves full transaction info
 */
async function getTransaction(reference) {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    return response.data.data;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return null;
  }
}

/**
 * Create Payment Plan (for recurring)
 * Creates a monthly subscription plan
 */
async function createPaymentPlan(planData) {
  try {
    const { name, description, amount, interval, plan_code } = planData;

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/plan`,
      {
        name,
        description,
        amount, // in kobo
        interval, // 'monthly', 'quarterly', 'biannually', 'annually'
        plan_code,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      planId: response.data.data.id,
      planCode: response.data.data.plan_code,
    };
  } catch (error) {
    console.error('Error creating payment plan:', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * List All Plans
 */
async function getPlans() {
  try {
    const response = await axios.get(`${PAYSTACK_BASE_URL}/plan`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    return response.data.data;
  } catch (error) {
    console.error('Error fetching plans:', error);
    return null;
  }
}

/**
 * Validate Paystack Webhook Signature
 * Verifies webhook is from Paystack
 */
function verifyWebhookSignature(body, signature) {
  const crypto = require('crypto');
  
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(body))
    .digest('hex');

  return hash === signature;
}

module.exports = {
  initializePayment,
  verifyPayment,
  getTransaction,
  createPaymentPlan,
  getPlans,
  verifyWebhookSignature,
};
