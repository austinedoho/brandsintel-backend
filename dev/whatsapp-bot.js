/**
 * BrandsIntel WhatsApp Bot
 * Handles verification requests via WhatsApp
 * Uses Twilio for WhatsApp Cloud API
 */

const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

// Twilio config
const TWILIO_PHONE_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+1234567890';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Your API base URL
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// Helper: Send WhatsApp message via Twilio
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: `whatsapp:${to}`,
        Body: message,
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
      }
    );
    console.log('WhatsApp message sent:', response.data.sid);
    return true;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error.message);
    return false;
  }
}

// Helper: Format verification result for WhatsApp
function formatVerificationForWhatsApp(result) {
  const trustEmoji = {
    established: '🟢',
    caution: '🟡',
    elevated_risk: '🟠',
    high_risk: '🔴',
    insufficient_data: '⚪',
  };

  const emoji = trustEmoji[result.riskLevel] || '❓';

  return `
${emoji} *${result.businessName || 'Business'} - ${result.riskLevel.toUpperCase()}*

*Trust Score:* ${result.trustScore}/100
*Risk Level:* ${result.riskLevel}

*Why:*
${result.explanation}

*Key Factors:*
${result.keyIndicators.slice(0, 3).map((k) => `• ${k}`).join('\n')}

*What to do:*
${result.nextSteps}

Learn more: brandsintel.com
`.trim();
}

// Helper: Format payment check for WhatsApp
function formatPaymentCheckForWhatsApp(result) {
  const trustEmoji = {
    established: '🟢',
    caution: '🟡',
    elevated_risk: '🟠',
    high_risk: '🔴',
    insufficient_data: '⚪',
  };

  const emoji = trustEmoji[result.riskLevel] || '❓';

  return `
${emoji} *Payment Risk Check*

*Account:* ${result.accountName}
*Bank:* ${result.bank}
*Risk Level:* ${result.riskLevel.toUpperCase()}

*Assessment:*
${result.explanation}

${
  result.shouldBlock
    ? '*⚠️ HIGH RISK - Be very careful with this account*'
    : '*Status: Proceed with caution and verify independently*'
}

Learn more: brandsintel.com
`.trim();
}

// ============================================================
// WEBHOOK: Incoming WhatsApp Messages
// ============================================================

/**
 * POST /whatsapp/webhook
 * Receives incoming WhatsApp messages from Twilio
 */
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  const incomingMessage = req.body.Body?.trim() || '';
  const senderPhoneNumber = req.body.From?.replace('whatsapp:', '') || '';

  console.log(`📱 WhatsApp message from ${senderPhoneNumber}: "${incomingMessage}"`);

  // Respond with 200 immediately to Twilio
  res.status(200).send('OK');

  // Process message asynchronously
  try {
    let response = '';

    // Parse message
    const upperMessage = incomingMessage.toUpperCase();

    // Command: Check business
    if (upperMessage.startsWith('CHECK:') || upperMessage.startsWith('CHECK ')) {
      const businessName = incomingMessage.replace(/^CHECK:?\s*/i, '').trim();

      if (businessName.length < 2) {
        await sendWhatsAppMessage(
          senderPhoneNumber,
          '❌ Please provide a business name.\n\nExample: "Check Jumia" or "Check ABC Electronics"'
        );
        return;
      }

      // Call our verification API
      try {
        const verificationResponse = await axios.post(`${API_BASE}/api/verify`, {
          businessName,
        });

        response = formatVerificationForWhatsApp(verificationResponse.data);
      } catch (apiError) {
        console.error('API call failed:', apiError.message);
        response =
          '❌ Could not verify at this moment. Please try again in a few seconds.\n\nOur servers are processing a lot of checks right now.';
      }
    }

    // Command: Check payment account
    else if (
      upperMessage.startsWith('ACCOUNT:') ||
      upperMessage.startsWith('PAYMENT:') ||
      (incomingMessage.split('-').length === 2 && incomingMessage.split('-')[1].trim().length > 5)
    ) {
      // Format: "ACCOUNT: 0123456789 - GTBank" or "0123456789 - GTBank"
      const parts = incomingMessage.split('-');
      if (parts.length === 2) {
        const accountNumber = parts[0]
          .replace(/^(ACCOUNT:|PAYMENT:)/i, '')
          .trim();
        const bank = parts[1].trim();

        if (accountNumber.length < 10) {
          await sendWhatsAppMessage(
            senderPhoneNumber,
            '❌ Invalid account number format.\n\nExample: "0123456789 - GTBank"'
          );
          return;
        }

        try {
          const verificationResponse = await axios.post(`${API_BASE}/api/verify-payment`, {
            accountName: accountNumber,
            accountNumber,
            bank,
          });

          response = formatPaymentCheckForWhatsApp(verificationResponse.data);
        } catch (apiError) {
          console.error('Payment check API failed:', apiError.message);
          response =
            '❌ Could not verify payment account. Please try again.\n\nExample format: "0123456789 - GTBank"';
        }
      } else {
        response =
          '❌ Please use this format:\n\n"0123456789 - GTBank"\n\nAccount number - Bank name';
      }
    }

    // Command: Help
    else if (
      upperMessage === 'HELP' ||
      upperMessage === 'START' ||
      upperMessage === 'HI' ||
      upperMessage === 'HELLO'
    ) {
      response = `
*Welcome to BrandsIntel* 👋

Verify Nigerian businesses before sending money.

*Commands:*

*1. Check a business*
   "Check Jumia"
   "Check ABC Electronics"

*2. Check a payment account*
   "0123456789 - GTBank"
   (Account number - Bank name)

*3. Get help*
   Send "Help"

*Examples:*
Check Jumia
Check Fashion Store NG
0123456789 - GTBank
1234567890 - Access

We'll check the business/account against our fraud database and give you a risk score.

*Need to report a scam?*
Send "Report" for details.
      `.trim();
    }

    // Command: Report scam
    else if (upperMessage === 'REPORT') {
      response = `
*Report a Scam* 🚨

Help us protect Nigerians by reporting fraudulent businesses.

Send:
"Report: Business name - What happened"

*Examples:*
"Report: Fake Jumia - Didn't receive my order"
"Report: Fake MTN - Asked for processing fee for job"
"Report: Unknown store - Payment never arrived"

Your reports are anonymous and help improve BrandsIntel.
      `.trim();
    }

    // No command recognized
    else {
      response = `
*BrandsIntel Verification* 🔍

I didn't understand that command.

*Try these:*
• "Check Jumia" — Verify a business
• "0123456789 - GTBank" — Check a payment account
• "Help" — See all commands
• "Report" — Report a scam

What would you like to check?
      `.trim();
    }

    // Send response
    if (response) {
      await sendWhatsAppMessage(senderPhoneNumber, response);
    }
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    await sendWhatsAppMessage(
      senderPhoneNumber,
      '⚠️ Something went wrong. Please try again.'
    );
  }
});

// ============================================================
// SMS Webhook (for feature phone users)
// ============================================================

router.post('/sms/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  const incomingMessage = req.body.Body?.trim() || '';
  const senderPhone = req.body.From?.trim() || '';

  console.log(`📞 SMS from ${senderPhone}: "${incomingMessage}"`);
  res.status(200).send('OK');

  // SMS handling similar to WhatsApp but format differently
  // (SMS doesn't support emojis, use text instead)
});

// ============================================================
// Dashboard: Business can send broadcasts
// ============================================================

/**
 * POST /whatsapp/broadcast
 * Send alert to business's customers
 * Requires business authentication
 */
router.post('/broadcast', async (req, res) => {
  try {
    const { businessId, message, audience } = req.body;

    // In production: verify business authentication
    // For now: just accept

    if (!message || message.length < 5) {
      return res.status(400).json({ error: 'Message too short' });
    }

    // Get business customers from your database
    // For this MVP: just acknowledge

    res.json({
      success: true,
      message: 'Broadcast queued',
      estimatedRecipients: 0,
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
