import re
import sys

def remove_emojis_from_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simpler emoji removal using emoji library or just plain replace since we know the exact emojis.
    # We found these exact emojis in our grep:
    emojis_to_remove = [
        "🟢", "🔴", "⚪", "❌", "⏳", "⚠️", "🚨", "✅",
        "🎯", "⚖️", "🔬", "🌊", "🌐", "🛡️", "⚡", "📝", "🤖", "👁️"
    ]
    
    new_content = content
    for emoji in emojis_to_remove:
        new_content = new_content.replace(emoji, '')
        
    # Clean up any leftover spaces if an emoji was followed by a space
    new_content = new_content.replace(' BEGINNER TAKEAWAY', 'BEGINNER TAKEAWAY')
    new_content = new_content.replace(' MATHEMATICAL ASYMMETRY', 'MATHEMATICAL ASYMMETRY')
    new_content = new_content.replace(' FRACTAL MATHEMATICS', 'FRACTAL MATHEMATICS')
    new_content = new_content.replace(' LEVEL 2 ORDER BOOK', 'LEVEL 2 ORDER BOOK')
    new_content = new_content.replace(' MULTI-TIMEFRAME', 'MULTI-TIMEFRAME')
    new_content = new_content.replace(' SMART MONEY LIQUIDITY', 'SMART MONEY LIQUIDITY')
    new_content = new_content.replace(' CAPITAL PRESERVATION', 'CAPITAL PRESERVATION')
    new_content = new_content.replace(' DO NOT TRADE', 'DO NOT TRADE')
    new_content = new_content.replace(' RISK BLOCKED', 'RISK BLOCKED')
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
    else:
        print(f"No changes in {filepath}")

files = [
    'backend/geminiEngine.js',
    'backend/globalAnalysisCache.js',
    'frontend/src/components/InstitutionalReport.jsx',
    'frontend/src/components/AiMessageBubble.jsx',
    'frontend/src/components/PromptInputBar.jsx',
    'frontend/src/components/PerformanceDashboard.jsx'
]

for file in files:
    remove_emojis_from_file(file)

