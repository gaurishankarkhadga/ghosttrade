import React from 'react';
import './MessageBubble.css';

export default function UserMessageBubble({ content }) {
  return (
    <div className="message-wrapper user">
      <div className="avatar user">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="avatar-icon">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
      <div className="message-content">
        <p className="message-text">
          {content}
        </p>
      </div>
    </div>
  );
}
