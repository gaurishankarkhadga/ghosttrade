#!/bin/bash
# Remove everything after the media query
sed -i '/\/\* Mobile responsive padding for top navbar \*\//,$d' ../frontend/src/components/TerminalNavbar.css

# Add it back correctly
cat << 'CSS_EOF' >> ../frontend/src/components/TerminalNavbar.css
/* Mobile responsive padding for top navbar */
@media (max-width: 768px) {
  .terminal-top-navbar {
    top: 1rem;
    width: calc(100% - 2rem);
    padding: 0.5rem 1rem;
  }

  header.terminal-top-navbar.audit-mobile-hidden {
    display: none !important;
  }
}
CSS_EOF
