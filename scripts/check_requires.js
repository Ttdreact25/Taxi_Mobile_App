const fs = require('fs');
const path = require('path');

let errors = 0;
function testDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') testDir(full);
    } else if (f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, lineNo) => {
        const matches = [...line.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
        for (const m of matches) {
          const reqPath = m[1];
          if (reqPath.startsWith('.')) {
            const resolved = path.resolve(dir, reqPath);
            const exists = ['', '.js', '.jsx', '.json', '.png', '.jpg', '.jpeg', '.wav', '/index.js'].some(ext => fs.existsSync(resolved + ext));
            if (!exists) {
              console.log(`ERROR: Missing asset/file: ${full}:${lineNo + 1} -> ${reqPath}`);
              errors++;
            }
          }
        }
      });
    }
  }
}

testDir('./src');
console.log(`Total missing assets: ${errors}`);
