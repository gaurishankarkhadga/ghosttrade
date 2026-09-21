export function getAnalysisDisclaimer(type) {
    switch(type) {
        case 'chart_analysis':
            return `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ REGULATORY DISCLOSURE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• This is AI-generated quantitative analysis for educational and informational purposes only.\n• This is NOT investment advice, trading advice, or a recommendation to buy/sell any security.\n• Ghostrade is a market analysis platform — NOT a SEBI-registered Investment Adviser (IA) or Research Analyst (RA).\n• Investment in securities market is subject to market risks. Read all related documents carefully before investing.\n• Past performance or analytical accuracy does not guarantee future results.\n• Always consult a SEBI-registered investment adviser before making investment decisions.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        case 'conversation':
            return `\n\n⚠️ This is AI-generated market analysis for informational purposes only — not investment advice. Consult a SEBI-registered adviser before investing.`;
        case 'data_backed':
            return `\n\n⚠️ Data-driven analysis for educational purposes only. Not investment advice. Investment in securities is subject to market risks. Consult a SEBI-registered adviser.`;
        default:
            return `\n\n⚠️ This is AI-generated market analysis for informational purposes only — not investment advice. Consult a SEBI-registered adviser before investing.`;
    }
}

export function getFooterDisclaimer() {
    return `Ghostrade is an AI-powered market analysis platform for educational and informational purposes only. It is NOT registered with SEBI as an Investment Adviser or Research Analyst. Investment in securities market is subject to market risks. Past analytical performance does not guarantee future results.`;
}

export const SEBI_SAFE_LABELS = {
    TRADE: 'ANALYSIS_COMPLETE',
    SHIELD_MODE: 'OBSERVATION_ONLY',
    PREDICTION_VERDICT: 'ANALYSIS_SUMMARY',
    TRADE_LEVELS: 'KEY_PRICE_LEVELS',
    ENGINE_VERDICT: 'ENGINE_ANALYSIS',
    QUANTITATIVE_EDGE_CONFIRMED: 'STATISTICAL_CONFLUENCE_DETECTED',
    HIGH_CONVICTION: 'HIGH_CONFLUENCE',
    QUANT_ENGINE: 'ANALYSIS_ENGINE',
    AI_VERDICT: 'AI_ANALYSIS'
};
