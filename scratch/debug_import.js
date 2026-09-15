import('./../backend/adapters/nepseAdapter.js').then(m => {
  console.log("Success:", Object.keys(m));
  m.fetchNepseOHLCV("NABIL.NP", 100).then(console.log).catch(console.error);
}).catch(e => console.error("Import failed:", e));
