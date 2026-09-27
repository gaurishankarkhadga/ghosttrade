import bcrypt from 'bcryptjs';
import fetch from 'node-fetch';
import { getDb } from '../mongoConfig.js'; // using global fetch, but node-fetch as fallback if needed

// Helper to validate email (copied from server.js for encapsulation)
async function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return { isValid: false, error: 'Invalid email format' };
  
  const disposableDomains = ['tempmail.com', '10minutemail.com', 'throwawaymail.com'];
  const domain = email.split('@')[1].toLowerCase();
  if (disposableDomains.includes(domain)) {
    return { isValid: false, error: 'Disposable email addresses are not allowed.' };
  }
  
  return { isValid: true, sanitized: email.toLowerCase().trim() };
}

export default async function forgotPasswordRoutes(fastify, options) {

  // -------------------------------------------------------------
  // 1. FORGOT PASSWORD - Send Recovery OTP
  // -------------------------------------------------------------
  fastify.post('/api/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    try {
      const { email } = request.body;
      if (!email) return reply.code(400).send({ error: 'Email is required' });

      const emailCheck = await validateEmail(email);
      if (!emailCheck.isValid) return reply.code(400).send({ error: emailCheck.error });

      const fetchClient = globalThis.fetch || fetch;
      const res = await fetchClient(`${process.env.SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({ email: emailCheck.sanitized })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const statusCode = res.status === 429 ? 429 : 400;
        const errorMsg = errData.msg || errData.message || 'Failed to send recovery email';
        return reply.code(statusCode).send({ error: errorMsg, details: errData });
      }

      return reply.send({ success: true, message: 'Recovery OTP sent successfully' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Internal server error', details: err.message });
    }
  });

  // -------------------------------------------------------------
  // 2. VERIFY RECOVERY OTP
  // -------------------------------------------------------------
  fastify.post('/api/auth/verify-recovery-otp', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    try {
      const { email, otp } = request.body;
      if (!email || !otp) {
        return reply.code(400).send({ error: 'Email and OTP are required' });
      }

      const emailCheck = await validateEmail(email);
      if (!emailCheck.isValid) return reply.code(400).send({ error: emailCheck.error });

      const fetchClient = globalThis.fetch || fetch;

      const verifyRes = await fetchClient(`${process.env.SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({ type: 'recovery', email: emailCheck.sanitized, token: otp })
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({}));
        return reply.code(400).send({ error: 'Invalid or expired OTP', details: errData });
      }

      const sessionData = await verifyRes.json();
      return reply.send({ 
        success: true, 
        message: 'OTP verified successfully',
        recoveryToken: sessionData.access_token 
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Internal server error', details: err.message });
    }
  });

  // -------------------------------------------------------------
  // 3. UPDATE PASSWORD
  // -------------------------------------------------------------
  fastify.post('/api/auth/update-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    try {
      const { email, recoveryToken, newPassword } = request.body;
      if (!email || !recoveryToken || !newPassword) {
        return reply.code(400).send({ error: 'Email, recovery token, and new password are required' });
      }

      if (newPassword.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters long' });
      }
      
      const emailCheck = await validateEmail(email);

      const fetchClient = globalThis.fetch || fetch;

      const updateRes = await fetchClient(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${recoveryToken}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        return reply.code(400).send({ error: 'Failed to update password in Auth provider. Token may be expired.', details: errData });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const db = await getDb();
      const updateResult = await db.collection('users').updateOne(
        { email: emailCheck.sanitized },
        { $set: { passwordHash: hashedPassword } }
      );

      return reply.send({ success: true, message: 'Password has been successfully reset!' });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Internal server error', details: err.message });
    }
  });
}
