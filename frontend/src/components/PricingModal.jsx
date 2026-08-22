import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { initializePaddle } from '@paddle/paddle-js';
import useGhostStore from '../store/ghostStore';
import './PricingModal.css';

const PADDLE_CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || import.meta.env.PADDLE_CLIENT_SIDE_TOKEN || 'test_983c8aac7b0b49697a609af84c6';
const PADDLE_ENV = import.meta.env.VITE_PADDLE_ENV || 'sandbox';

const TIER_ORDER = {
  'trader': 0,
  'starter': 1,
  'pro': 2,
  'advanced': 3
};

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    badge: 'ESSENTIAL',
    description: 'Perfect for retail traders wanting AI market regime signals.',
    monthlyPrice: 10,
    yearlyPrice: 100,
    monthlyPriceId: 'pri_01kz8jdf26ge5pkka4aszfv8tn',
    yearlyPriceId: 'pri_01kz8jdffb7dxeb3jfb02fhazj',
    features: [
      'Real-time Crypto & Stock Watchlists',
      'AI Regime Detection (Trending/Ranging)',
      'Basic Order Flow Metrics',
      'Standard Execution Speeds',
      '7-Day Free Trial'
    ],
    popular: false
  },
  {
    id: 'pro',
    name: 'Pro Terminal',
    badge: 'MOST POPULAR',
    description: 'Full quantitative AI engine with Hurst exponent & paper trading.',
    monthlyPrice: 40,
    yearlyPrice: 400,
    monthlyPriceId: 'pri_01kz8jdg7sf99hdnbk3s9nkwte',
    yearlyPriceId: 'pri_01kz8jdgmkmczngnt1a00dwxdf',
    features: [
      'Everything in Starter',
      'Hurst Exponent Quantitative Analysis',
      'Full Multi-User Angel One Integration',
      'Automated Paper & Live Executions',
      'Institutional Audit Logs & Daemons',
      '7-Day Free Trial'
    ],
    popular: true
  },
  {
    id: 'advanced',
    name: 'Institutional',
    badge: 'MAXIMUM POWER',
    description: 'High-frequency algorithmic execution & multi-account routing.',
    monthlyPrice: 120,
    yearlyPrice: 1200,
    monthlyPriceId: 'pri_01kz8jdhbreyvt9by9y8jtx3tb',
    yearlyPriceId: 'pri_01kz8jdhnxxkzbkexky519kmzf',
    features: [
      'Everything in Pro',
      'Sub-millisecond Smart Order Routing',
      'Custom AI Risk Management Rules',
      'Priority WebSocket Pipeline',
      'Dedicated Quant Advisory & Support',
      '7-Day Free Trial'
    ],
    popular: false
  }
];

export function PricingModal() {
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'
  const [paddle, setPaddle] = useState(null);
  const [loadingPriceId, setLoadingPriceId] = useState(null);
  const [initError, setInitError] = useState(null);

  const { role, email: userEmail, promptsUsed, syncSubscription } = useGhostStore();
  const forceLock = role === 'trader' && promptsUsed >= 3;

  const selectedPlanRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    if (PADDLE_CLIENT_TOKEN) {
      initializePaddle({
        token: PADDLE_CLIENT_TOKEN,
        environment: PADDLE_ENV,
        eventCallback: (event) => {
          console.log('[PADDLE EVENT]', event.name, event.data);
          if (event.name === 'checkout.completed') {
            syncSubscription(selectedPlanRef.current);
            navigate('/terminal');
          }
        }
      })
        .then((p) => {
          if (isMounted && p) setPaddle(p);
        })
        .catch((err) => {
          console.error('[PADDLE INIT ERROR]', err);
          if (isMounted) setInitError('Failed to load payment engine. Check Sandbox settings.');
        });
    }

    return () => {
      isMounted = false;
    };
  }, [navigate, syncSubscription]);

  const handleSubscribe = (plan) => {
    selectedPlanRef.current = plan.id;
    const priceId = billingCycle === 'monthly' ? plan.monthlyPriceId : plan.yearlyPriceId;
    setLoadingPriceId(priceId);

    if (paddle) {
      try {
        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customer: userEmail ? { email: userEmail } : undefined,
          customData: userEmail ? { userId: userEmail } : undefined,
          settings: {
            variant: 'one-page',
            displayMode: 'overlay',
            theme: 'dark'
          }
        });
      } catch (err) {
        console.error('[PADDLE CHECKOUT ERROR]', err);
      } finally {
        setLoadingPriceId(null);
      }
    } else {
      alert('Paddle payment engine is initializing... Please try again in 2 seconds.');
      setLoadingPriceId(null);
    }
  };

  return (
    <div className="pricing-modal-overlay">
      <div className="pricing-modal-container">
        {!forceLock && <button className="pricing-modal-close" onClick={() => navigate('/terminal')}>&times;</button>}

        <div className="pricing-header">
          <div className="pricing-title-badge">⚡ GHOSTTRADE INTELLIGENCE SUITE</div>
          <h2>Select Your Operational Edge</h2>
          <p>Institutional-grade AI quantitative signals, automated risk management, and multi-broker routing.</p>

          <div className="billing-toggle-container">
            <span className={billingCycle === 'monthly' ? 'active' : ''}>Monthly Billing</span>
            <button
              className={`billing-toggle-btn ${billingCycle === 'yearly' ? 'yearly' : ''}`}
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            >
              <div className="billing-toggle-thumb" />
            </button>
            <span className={billingCycle === 'yearly' ? 'active' : ''}>
              Annual Billing <span className="discount-pill">SAVE 17%</span>
            </span>
          </div>
        </div>

        {initError && <div className="pricing-error-banner">{initError}</div>}

        <div className="pricing-grid">
          {PLANS.map((plan) => {
            const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const priceId = billingCycle === 'monthly' ? plan.monthlyPriceId : plan.yearlyPriceId;
            const isSelectedLoading = loadingPriceId === priceId;

            const userTierLevel = TIER_ORDER[role] || 0;
            const planTierLevel = TIER_ORDER[plan.id] || 0;
            const isCurrentPlan = role === plan.id;
            const isDowngrade = userTierLevel > planTierLevel;
            const isDisabled = isSelectedLoading || isCurrentPlan || isDowngrade;

            let buttonText = isSelectedLoading ? 'Opening Checkout...' : 'Start 7-Day Free Trial';
            if (isCurrentPlan) buttonText = 'Current Plan';
            else if (isDowngrade) buttonText = 'Included in Current Plan';

            return (
              <div
                key={plan.id}
                className={`pricing-card ${plan.popular ? 'popular' : ''}`}
              >
                {plan.popular && <div className="popular-tag">MOST POPULAR</div>}
                <div className="plan-badge">{plan.badge}</div>
                <h3 className="plan-title">{plan.name}</h3>
                <p className="plan-description">{plan.description}</p>

                <div className="plan-price-box">
                  <span className="currency">$</span>
                  <span className="price-number">{price}</span>
                  <span className="period">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>

                <ul className="plan-features">
                  {plan.features.map((feat, idx) => (
                    <li key={idx}>
                      <span className="check-icon">✓</span> {feat}
                    </li>
                  ))}
                </ul>

                <button
                  className={`subscribe-btn ${plan.popular ? 'primary' : 'secondary'} ${(isCurrentPlan || isDowngrade) ? 'current-plan-btn' : ''}`}
                  onClick={() => handleSubscribe(plan)}
                  disabled={isDisabled}
                  style={(isCurrentPlan || isDowngrade) ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                >
                  {buttonText}
                </button>
              </div>
            );
          })}
        </div>

        <div className="pricing-footer-note">
          🔒 Payments secured by Paddle (Merchant of Record). Cancel anytime during trial with 0 charge.
        </div>
      </div>
    </div>
  );
}
