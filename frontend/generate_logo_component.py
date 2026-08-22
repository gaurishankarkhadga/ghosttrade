import re

with open('/home/gaurishankar/Desktop/animated_pro_logo.html', 'r') as f:
    content = f.read()

path_match = re.search(r'd="(.*?)"', content)
path_d = path_match.group(1)

jsx_code = f"""import React from 'react';

export default function AnimatedProLogo({{ 
  size = 40, 
  color = '#ffffff', 
  strokeWidth = 2,
  isAnimating = false,
  className = ""
}}) {{
  return (
    <div className={{`animated-pro-logo-container ${{className}}`}} style={{{{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}}}>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 1024 1024" 
        width="100%" 
        height="100%"
        className={{isAnimating ? 'animating-logo' : 'static-logo'}}
      >
        <path 
          d="{path_d}"
          fill={{isAnimating ? 'transparent' : color}}
          stroke={{color}}
          strokeWidth={{strokeWidth}}
          strokeLinecap="round"
          strokeLinejoin="round"
          fillRule="evenodd"
        />
      </svg>

      <style>{{`
        .animating-logo path {{
          stroke-dasharray: 15000;
          stroke-dashoffset: 15000;
          animation: 
            drawPath 3s cubic-bezier(0.25, 1, 0.5, 1) forwards,
            fillIn 1s ease-in 2.5s forwards;
        }}

        @keyframes drawPath {{
          to {{ stroke-dashoffset: 0; }}
        }}
        
        @keyframes fillIn {{
          to {{ fill: ${"{color}"}; stroke-width: 0; }}
        }}
      `}}</style>
    </div>
  );
}}
"""

with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/frontend/src/components/AnimatedProLogo.jsx', 'w') as f:
    f.write(jsx_code)
