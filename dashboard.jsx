/**
 * BrandsIntel Business Dashboard
 * React component for business profile management
 * 
 * Deploy separately or embed in your web app
 * Requires: React, Axios
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000';

export default function BusinessDashboard() {
  const [business, setBusiness] = useState(null);
  const [trustScore, setTrustScore] = useState(0);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    // In production: get business ID from auth token
    // For demo: use URL param ?business=Name
    const params = new URLSearchParams(window.location.search);
    const name = params.get('business') || 'ABC Electronics';
    setBusinessName(name);
    fetchBusinessData(name);
  }, []);

  async function fetchBusinessData(name) {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api/business/${encodeURIComponent(name)}`);
      setBusiness(response.data);

      if (response.data.risk_profiles && response.data.risk_profiles.length > 0) {
        const latest = response.data.risk_profiles[0];
        setTrustScore(latest.trust_score);
      }

      // Fetch reports
      if (response.data.id) {
        const reportsResponse = await axios.get(
          `${API_BASE}/api/business/${response.data.id}/reports`
        );
        setReports(reportsResponse.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch business data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyBusiness(e) {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/business/verify`, {
        businessName,
        website,
        email,
      });

      alert('✅ Business verified! You can now claim your profile.');
      fetchBusinessData(businessName);
    } catch (error) {
      alert('❌ Verification failed: ' + error.message);
    }
  }

  const getRiskColor = (level) => {
    const colors = {
      established: '#10b981',
      caution: '#f59e0b',
      elevated_risk: '#f97316',
      high_risk: '#ef4444',
      insufficient_data: '#6b7280',
    };
    return colors[level] || '#6b7280';
  };

  const getRiskEmoji = (level) => {
    const emojis = {
      established: '🟢',
      caution: '🟡',
      elevated_risk: '🟠',
      high_risk: '🔴',
      insufficient_data: '⚪',
    };
    return emojis[level] || '❓';
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading your business dashboard...</h2>
        <div style={{ fontSize: '3rem' }}>⏳</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '3rem' }}>
        <h1>📊 BrandsIntel Business Dashboard</h1>
        <p style={{ color: '#666' }}>Monitor your business reputation and trust score</p>
      </div>

      {/* Trust Score Card */}
      <div
        style={{
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem',
        }}
      >
        <h2>{businessName}</h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2rem',
            marginTop: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{trustScore}</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>Trust Score (0-100)</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem' }}>
              {getRiskEmoji(business?.risk_profiles?.[0]?.risk_level || 'insufficient_data')}
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              {business?.risk_profiles?.[0]?.risk_level?.toUpperCase() || 'UNKNOWN'}
            </div>
          </div>
        </div>
      </div>

      {/* Business Info */}
      <div
        style={{
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem',
        }}
      >
        <h3>Business Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>
              Website
            </label>
            <input
              type="url"
              value={website || business?.website || ''}
              onChange={(e) => setWebsite(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              placeholder="https://yourwebsite.com"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>
              Email
            </label>
            <input
              type="email"
              value={email || business?.email || ''}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
              }}
              placeholder="contact@yourwebsite.com"
            />
          </div>
        </div>
        <button
          onClick={handleVerifyBusiness}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem 1.5rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          ✓ Verify Business
        </button>
      </div>

      {/* Risk Assessment */}
      {business?.risk_profiles && business.risk_profiles.length > 0 && (
        <div
          style={{
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '2rem',
          }}
        >
          <h3>Latest Risk Assessment</h3>
          <p style={{ lineHeight: '1.6', color: '#333' }}>
            {business.risk_profiles[0].explanation}
          </p>
          {business.risk_profiles[0].key_indicators && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4>Key Indicators</h4>
              <ul style={{ color: '#666' }}>
                {business.risk_profiles[0].key_indicators.map((indicator, i) => (
                  <li key={i}>{indicator}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
            Assessed on {new Date(business.risk_profiles[0].generated_at).toLocaleDateString()}
          </div>
        </div>
      )}

      {/* Recent Reports */}
      <div
        style={{
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '2rem',
        }}
      >
        <h3>Customer Reports ({reports.length})</h3>
        {reports.length === 0 ? (
          <p style={{ color: '#666' }}>No reports yet. Great job maintaining your reputation!</p>
        ) : (
          <div>
            {reports.slice(0, 10).map((report) => (
              <div
                key={report.id}
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e5e7eb',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{report.report_type}</strong>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>{report.description}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        background: report.severity === 'high' ? '#fee2e2' : '#fef3c7',
                        color: report.severity === 'high' ? '#991b1b' : '#92400e',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                      }}
                    >
                      {report.severity}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '0.5rem' }}>
                      {new Date(report.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '3rem',
          padding: '2rem',
          background: '#f0f9ff',
          borderRadius: '12px',
          textAlign: 'center',
          color: '#0369a1',
        }}
      >
        <h4>Improve Your Trust Score</h4>
        <p>
          Get verified, respond to reports, and maintain accurate business information across
          platforms.
        </p>
        <a
          href="mailto:support@brandsintel.com"
          style={{ color: '#0369a1', textDecoration: 'underline' }}
        >
          Contact support for verification help
        </a>
      </div>
    </div>
  );
}
