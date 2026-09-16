const fs = require('node:fs');
const path = require('node:path');

const requiredNodeMajor = 20;
const currentNodeMajor = Number(process.versions.node.split('.')[0]);

if (currentNodeMajor < requiredNodeMajor) {
  console.error(`Node.js ${requiredNodeMajor}+ is required. You are using ${process.version}.`);
  process.exitCode = 1;
} else {
  const projectRoot = path.resolve(__dirname, '..');
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  if (fs.existsSync(envPath)) {
    console.log('.env already exists, so it was not changed.');
  } else {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('Created .env from .env.example.');
  }

  console.log('\nNext steps:');
  console.log('1. Add your Discord token and AI provider key to .env');
  console.log('2. Enable Message Content Intent in the Discord Developer Portal');
  console.log('3. Run: npm start');
}
