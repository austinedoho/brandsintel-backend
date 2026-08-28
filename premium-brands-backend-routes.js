const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  }
});

router.post('/api/premium-brand/submit', upload.single('cac_certificate'), async (req, res) => {
  try {
    const { company_name, email, phone, address, cac_number, paystack_reference } = req.body;

    if (!company_name || !email || !phone || !address || !cac_number) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['company_name', 'email', 'phone', 'address', 'cac_number']
      });
    }

    if (!cac_number.match(/^[A-Z0-9]{5,20}$/)) {
      return res.status(400).json({
        error: 'Invalid CAC number format. Should be 5-20 alphanumeric characters.'
      });
    }

    let certificateUrl = null;

    if (req.file) {
      const fileName = `cac_${cac_number}_${Date.now()}.${req.file.originalname.split('.').pop()}`;
      const folderPath = `premium-brands/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from('premium-brands')
        .upload(folderPath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload certificate' });
      }

      const { data: urlData } = supabase.storage
        .from('premium-brands')
        .getPublicUrl(folderPath);
      
      certificateUrl = urlData.publicUrl;
    }

    const subscriptionStartDate = new Date();
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);

    const { data, error } = await supabase
      .from('premium_brands')
      .insert([
        {
          company_name: company_name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone.trim(),
          address: address.trim(),
          cac_number: cac_number.toUpperCase().trim(),
          cac_certificate_url: certificateUrl,
          status: 'pending',
          paystack_reference: paystack_reference,
          subscription_start_date: subscriptionStartDate.toISOString(),
          subscription_end_date: subscriptionEndDate.toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('Database error:', error);
      if (error.code === '23505') {
        return res.status(400).json({
          error: 'CAC number already registered. Please contact support if you think this is an error.'
        });
      }
      return res.status(500).json({ error: 'Failed to submit premium brand application' });
    }

    console.log(`✅ Premium Brand submission: ${company_name} (CAC: ${cac_number})`);

    res.json({
      success: true,
      message: 'Premium Brand application submitted successfully! Admin will review and approve within 24 hours.',
      application_id: data[0].id,
      status: 'pending'
    });

  } catch (error) {
    console.error('Error in premium-brand/submit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/premium-brand/active', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('premium_brands')
      .select('id, company_name, email, phone, address, cac_number, verified_badge, featured_position')
      .eq('status', 'approved')
      .not('featured_until_date', 'is', null)
      .gt('featured_until_date', new Date().toISOString())
      .order('featured_position', { ascending: true })
      .limit(8);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch featured brands' });
    }

    res.json({
      count: data.length,
      brands: data
    });

  } catch (error) {
    console.error('Error in premium-brand/active:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/premium-brand/:cac_number', async (req, res) => {
  try {
    const { cac_number } = req.params;

    const { data, error } = await supabase
      .from('premium_brands')
      .select('*')
      .eq('cac_number', cac_number.toUpperCase())
      .eq('status', 'approved')
      .single();

    if (error) {
      return res.status(404).json({ error: 'Premium brand not found' });
    }

    res.json(data);

  } catch (error) {
    console.error('Error in premium-brand/:cac_number:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const verifyAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin key.' });
  }
  next();
};

router.get('/api/admin/premium-brand/pending', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('premium_brands')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch pending submissions' });
    }

    res.json({
      count: data.length,
      submissions: data
    });

  } catch (error) {
    console.error('Error in admin/premium-brand/pending:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/admin/premium-brand/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { featured_position, admin_notes } = req.body;

    if (featured_position && (featured_position < 1 || featured_position > 8)) {
      return res.status(400).json({ error: 'Featured position must be between 1 and 8' });
    }

    const featuredUntilDate = new Date();
    featuredUntilDate.setDate(featuredUntilDate.getDate() + 30);

    const { data, error } = await supabase
      .from('premium_brands')
      .update({
        status: 'approved',
        verified_badge: true,
        featured_position: featured_position || null,
        featured_until_date: featured_position ? featuredUntilDate.toISOString() : null,
        admin_notes: admin_notes || '',
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to approve premium brand' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'Premium brand not found' });
    }

    console.log(`✅ APPROVED: ${data[0].company_name} (CAC: ${data[0].cac_number})`);

    res.json({
      success: true,
      message: `Premium Brand approved: ${data[0].company_name}`,
      brand: data[0]
    });

  } catch (error) {
    console.error('Error in admin/premium-brand/:id/approve:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/admin/premium-brand/:id/reject', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    const { data, error } = await supabase
      .from('premium_brands')
      .update({
        status: 'rejected',
        admin_notes: admin_notes || 'No reason provided',
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to reject premium brand' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'Premium brand not found' });
    }

    console.log(`❌ REJECTED: ${data[0].company_name} (CAC: ${data[0].cac_number})`);

    res.json({
      success: true,
      message: `Premium Brand rejected: ${data[0].company_name}`,
      brand: data[0]
    });

  } catch (error) {
    console.error('Error in admin/premium-brand/:id/reject:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/admin/premium-brand/featured', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('premium_brands')
      .select('id, company_name, cac_number, featured_position, featured_until_date')
      .eq('status', 'approved')
      .not('featured_position', 'is', null)
      .order('featured_position', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch featured brands' });
    }

    res.json({
      count: data.length,
      featured_brands: data,
      available_slots: 8 - data.length
    });

  } catch (error) {
    console.error('Error in admin/premium-brand/featured:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/admin/premium-brand/:id/reposition', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { featured_position } = req.body;

    if (!featured_position || featured_position < 1 || featured_position > 8) {
      return res.status(400).json({ error: 'Featured position must be between 1 and 8' });
    }

    const { data, error } = await supabase
      .from('premium_brands')
      .update({
        featured_position: featured_position
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to update featured position' });
    }

    res.json({
      success: true,
      message: 'Featured position updated',
      brand: data[0]
    });

  } catch (error) {
    console.error('Error in admin/premium-brand/:id/reposition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;