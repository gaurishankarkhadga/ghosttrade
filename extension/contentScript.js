// =====================================================
// CONTENT SCRIPT — DOM Stealth Hardening Layer
// §1.4 — Dynamic Component Randomization + Runtime
// Style Scrambling to neutralize anti-extension scripts
// =====================================================

(function() {
  'use strict';

  // =====================================================
  // DYNAMIC TAG NAME GENERATION
  // Generate a unique custom element name per page load
  // to prevent pattern-based detection.
  // =====================================================
  function generateStealthTag() {
    const randomSuffix = Array.from(
      crypto.getRandomValues(new Uint8Array(6)),
      b => b.toString(36)
    ).join('').substring(0, 8);
    // Custom element names MUST contain a hyphen
    return `x-${randomSuffix}`;
  }

  // =====================================================
  // RUNTIME CLASS SCRAMBLER
  // Replaces all class names in CSS and HTML with random
  // prefixed versions to defeat class-pattern scanning.
  // =====================================================
  function generateClassPrefix() {
    return Array.from(
      crypto.getRandomValues(new Uint8Array(3)),
      b => b.toString(36)
    ).join('').substring(0, 6);
  }

  function scrambleClasses(cssText, htmlText, prefix) {
    // Extract all class names from the CSS using a regex
    const classRegex = /\.([a-zA-Z_-][\w-]*)/g;
    const classMap = new Map();
    let match;

    while ((match = classRegex.exec(cssText)) !== null) {
      const originalClass = match[1];
      if (!classMap.has(originalClass)) {
        classMap.set(originalClass, `${prefix}-${originalClass}`);
      }
    }

    // Replace classes in CSS
    let scrambledCss = cssText;
    for (const [original, scrambled] of classMap) {
      // Replace .class-name in CSS selectors
      const cssClassRegex = new RegExp(`\\.${escapeRegex(original)}(?=[\\s,:{\\[>+~.)\\]])`, 'g');
      scrambledCss = scrambledCss.replace(cssClassRegex, `.${scrambled}`);
    }

    // Replace class references in HTML
    let scrambledHtml = htmlText;
    for (const [original, scrambled] of classMap) {
      // Replace class="... original ..." in HTML attributes
      scrambledHtml = scrambledHtml.replace(
        new RegExp(`(?<=class=["'][^"']*)\\b${escapeRegex(original)}\\b(?=[^"']*["'])`, 'g'),
        scrambled
      );
    }

    return { css: scrambledCss, html: scrambledHtml, classMap };
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // =====================================================
  // STEALTH INJECTION ENGINE
  // Creates a custom element with a closed Shadow DOM,
  // injects scrambled styles and UI markup.
  // =====================================================
  function injectStealthContainer() {
    const tagName = generateStealthTag();
    const classPrefix = generateClassPrefix();

    // Register the custom element with a dynamic name
    class GhostElement extends HTMLElement {
      constructor() {
        super();
        // CLOSED shadow root — completely invisible to external scripts
        this._shadow = this.attachShadow({ mode: 'closed' });
      }

      get shadowRoot() {
        // Override to prevent leaking the shadow root
        return null;
      }
    }

    // Only define if not already registered (avoid duplicates on SPA navigations)
    if (!customElements.get(tagName)) {
      customElements.define(tagName, GhostElement);
    }

    // Create and insert the stealth container
    const container = document.createElement(tagName);
    
    // Randomize position attributes to prevent fixed-position scanning
    const positions = ['fixed', 'absolute'];
    container.style.position = positions[Math.floor(Math.random() * positions.length)];
    container.style.zIndex = String(Math.floor(Math.random() * 9000) + 1000);
    container.style.top = '0';
    container.style.right = '0';
    container.style.pointerEvents = 'none'; // Non-interactive until activated

    document.documentElement.appendChild(container);

    console.log(`[GHOST-STEALTH] Injected as <${tagName}> with class prefix [${classPrefix}]`);

    return {
      tagName,
      classPrefix,
      container,
      shadow: container._shadow,
    };
  }

  // =====================================================
  // ANTI-DETECTION COUNTERMEASURES
  // Hooks into MutationObserver to detect removal attempts
  // and re-inject if the container is forcibly removed.
  // =====================================================
  function setupAntiRemoval(container) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode === container) {
            console.warn('[GHOST-STEALTH] Container was forcibly removed. Re-injecting...');
            // Re-inject with a NEW tag name to evade pattern caching
            setTimeout(() => {
              const newStealth = injectStealthContainer();
              setupAntiRemoval(newStealth.container);
            }, 100 + Math.random() * 200);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: false,
    });

    return observer;
  }

  // =====================================================
  // INITIALIZATION
  // Only activates on trading platform domains.
  // The stealth layer is passive — it creates the
  // infrastructure for future in-page UI injection.
  // =====================================================
  const TRADING_DOMAINS = [
    'tradingview.com',
    'binance.com',
    'coinbase.com',
    'kucoin.com',
    'bybit.com',
    'okx.com',
    'kraken.com',
    'bitfinex.com',
    'gate.io',
    'mexc.com',
    'investing.com',
    'webull.com',
    'thinkorswim.com',
    'metatrader4.com',
    'metatrader5.com',
    'etoro.com',
    'zerodha.com',
    'kite.zerodha.com',
    'upstox.com',
    'groww.in',
    'dhan.co',
  ];

  function isOnTradingPlatform() {
    const hostname = window.location.hostname.toLowerCase();
    return TRADING_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  }

  // Only inject on trading platforms
  if (isOnTradingPlatform()) {
    // Delay slightly to avoid race conditions with platform scripts
    const delay = 500 + Math.floor(Math.random() * 1000);
    setTimeout(() => {
      const stealth = injectStealthContainer();
      setupAntiRemoval(stealth.container);
    }, delay);
  }

})();
