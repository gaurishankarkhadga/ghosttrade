const potrace = require('potrace');
const fs = require('fs');

potrace.trace('public/logo_final.png', function(err, svg) {
  if (err) throw err;
  fs.writeFileSync('/home/gaurishankar/Desktop/test_logo_traced.html', `<!DOCTYPE html>
<html>
<head>
<title>Traced SVG Logo</title>
<style>
body { background: #000; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; }
svg { width: 300px; height: 300px; }
path { 
  fill: none; 
  stroke: #fff; 
  stroke-width: 1; 
  stroke-dasharray: 5000; 
  stroke-dashoffset: 5000; 
  animation: draw 5s forwards; 
}
@keyframes draw { to { stroke-dashoffset: 0; } }
</style>
</head>
<body>
${svg}
</body>
</html>`);
  console.log('Trace done');
});
