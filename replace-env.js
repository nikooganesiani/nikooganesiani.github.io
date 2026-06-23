const fs = require('fs');
const path = require('path');

// Читаем .env файл
const envFile = fs.readFileSync('.env', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.join('=').trim();
  }
});

// Читаем HTML
let html = fs.readFileSync('index.html', 'utf8');

// Заменяем process.env на реальные значения
Object.keys(envVars).forEach(key => {
  const regex = new RegExp(`process\\.env\\.${key}`, 'g');
  html = html.replace(regex, `'${envVars[key]}'`);
});

// Сохраняем
fs.writeFileSync('index.html', html);
console.log('✅ Environment variables replaced!');
