import { fetchMultiTimeframeOHLCV } from '../backend/dataFetcher.js';
async function main() {
    try {
        const rel = await fetchMultiTimeframeOHLCV('RELIANCE.NS', 300);
        console.log("RELIANCE.NS:", rel);
    } catch(err) {
        console.error(err);
    }
}
main();
