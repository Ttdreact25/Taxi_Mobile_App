const path = require('path');
const fs = require('fs');
const eslintPath = path.resolve(__dirname, '../../admin/node_modules/eslint');
const { ESLint } = require(eslintPath);

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

async function run() {
  const files = getFiles(path.resolve(__dirname, '../src'));
  console.log(`Running ESLint syntax & parser verification on ${files.length} mobile source files...`);

  const eslint = new ESLint({
    useEslintrc: false,
    baseConfig: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      rules: {}
    }
  });

  const results = await eslint.lintFiles(files);
  let totalErrors = 0;
  let totalWarnings = 0;

  results.forEach(r => {
    if (r.errorCount > 0 || r.warningCount > 0) {
      console.log(`\n❌ ${r.filePath} (errors: ${r.errorCount}, warnings: ${r.warningCount})`);
      r.messages.forEach(m => console.log(`   Line ${m.line}:${m.column} [${m.severity === 2 ? 'ERROR' : 'WARN'}] ${m.message}`));
      totalErrors += r.errorCount;
      totalWarnings += r.warningCount;
    }
  });

  console.log('\n========================================');
  console.log(`ESLINT SCAN SUMMARY:`);
  console.log(`Total files scanned: ${files.length}`);
  console.log(`Total syntax/parsing errors: ${totalErrors}`);
  console.log(`Total warnings: ${totalWarnings}`);
  console.log('========================================');

  if (totalErrors > 0) {
    process.exit(1);
  } else {
    console.log('✅ ZERO syntax/parsing errors across the entire React Native codebase!');
  }
}

run().catch(err => {
  console.error('ESLint runner fatal error:', err);
  process.exit(1);
});
