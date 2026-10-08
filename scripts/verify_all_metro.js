const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.expo' && file !== 'dist') {
        results = results.concat(getFiles(fullPath));
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getFiles('.');
console.log(`Starting full transformation check of ${files.length} React Native files...`);

let failed = 0;
let succeeded = 0;

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    // Transform with Metro's exact Babel config
    babel.transformSync(code, {
      filename: file,
      configFile: false,
      babelrc: false,
      presets: [require('babel-preset-expo')],
      sourceType: 'module',
    });
    succeeded++;
  } catch (err) {
    failed++;
    console.error(`❌ FAILED: ${file}`);
    console.error(err.message);
  }
}

console.log(`\n========================================`);
console.log(`RESULTS: ${succeeded} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ ALL React Native files successfully transformed with zero syntax errors!');
}
