import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import useGhostStore from '../store/ghostStore';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useGhostStore(state => state.token);
  const fetchBrokerStatus = useGhostStore(state => state.fetchBrokerStatus);
  
  const [status, setStatus] = useState('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const broker = searchParams.get('broker');

    if (!code || !broker) {
      setStatus('error');
      setErrorMsg('Invalid OAuth callback. Missing code or broker.');
      return;
    }

    const finalizeConnection = async () => {
      try {
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const res = await fetch(`${baseUrl}/api/broker/oauth/callback`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ broker, code, state: stateParam })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
          await fetchBrokerStatus();
          setStatus('success');
          setTimeout(() => navigate('/settings'), 2000);
        } else {
          setStatus('error');
          setErrorMsg(data.error || 'Failed to exchange OAuth token.');
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg('Network error while completing OAuth flow.');
      }
    };

    finalizeConnection();
  }, [searchParams, navigate, token, fetchBrokerStatus]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0a0a0a',
      color: '#fff'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: '#111',
          padding: '40px',
          borderRadius: '16px',
          border: '1px solid #222',
          textAlign: 'center',
          maxWidth: '400px',
          width: '100%'
        }}
      >
        {status === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Loader2 className="animate-spin text-blue-500" size={48} />
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Finalizing Connection</h2>
            <p style={{ color: '#888', margin: 0, fontSize: '14px' }}>Exchanging authorization code securely...</p>
          </div>
        )}
        
        {status === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <CheckCircle2 className="text-emerald-500" size={56} />
            </motion.div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Connection Successful</h2>
            <p style={{ color: '#888', margin: 0, fontSize: '14px' }}>Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <AlertCircle className="text-red-500" size={48} />
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Connection Failed</h2>
            <p style={{ color: '#ef4444', margin: 0, fontSize: '14px' }}>{errorMsg}</p>
            <button 
              onClick={() => navigate('/settings')}
              style={{
                marginTop: '16px',
                padding: '10px 24px',
                background: '#222',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Return to Settings
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
