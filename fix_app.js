const fs = require('fs');
let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

const regex = /<TerminalNavbar\s*isConnected=\{isConnected\}\s*onLockTerminal=\{[^}]+\}\s*\/>\s*<div className=\{isAuditPage \? "hide-navbar-mobile" : ""\}>/;

code = code.replace(regex, '<div className={isAuditPage ? "hide-navbar-mobile" : ""}>');
fs.writeFileSync('frontend/src/App.jsx', code);
