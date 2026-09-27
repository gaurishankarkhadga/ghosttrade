import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function OtpInputBoxes({ value = '', onChange, length = 8, disabled = false, autoFocus = true }) {
  const inputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const digits = value ? value.split('') : [];

  return (
    <div 
      onClick={handleClick}
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        cursor: 'text',
        userSelect: 'none',
        margin: '12px 0 18px 0'
      }}
    >
      {/* Real Hidden HTML Input */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        value={value}
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, length);
          if (onChange) onChange(val);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        aria-label="Enter 8-digit OTP code"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'text',
          zIndex: 5
        }}
      />

      {/* 8 Smooth Animated Boxes */}
      {Array.from({ length }).map((_, index) => {
        const digit = digits[index];
        const isCurrent = isFocused && index === Math.min(digits.length, length - 1);
        const isFilled = digit !== undefined && digit !== '';

        return (
          <div
            key={index}
            style={{
              flex: 1,
              maxWidth: '38px',
              height: '48px',
              borderRadius: '8px',
              background: 'var(--color-ghost-surface)',
              border: isCurrent 
                ? '1px solid var(--color-ghost-buy)' 
                : isFilled 
                ? '1px solid var(--border-strong)' 
                : '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '18px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
              position: 'relative',
              boxShadow: isCurrent ? '0 0 0 1px var(--color-ghost-buy)' : 'none'
            }}
          >
            {isFilled ? (
              <motion.span
                key={`digit-${index}-${digit}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {digit}
              </motion.span>
            ) : isCurrent ? (
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 0.85, ease: 'easeInOut' }}
                style={{
                  width: '2px',
                  height: '20px',
                  background: 'var(--color-ghost-buy)',
                  display: 'inline-block',
                  borderRadius: '1px'
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
