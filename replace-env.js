const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
if (!fs.existsSync(htmlPath)) {
    console.error('❌ index.html not found');
    process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
let envVars = {};

// 1. Пытаемся прочитать .env если он есть (для локалки)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) envVars[key.trim()] = value.join('=').trim();
    });
}

// 2. Добавляем системные переменные (для Cloudflare/GitHub Actions)
// Если переменная есть в системе, она перекроет значение из .env
Object.keys(process.env).forEach(key => {
    envVars[key] = process.env[key];
});

// 3. Заменяем в HTML
let count = 0;
Object.keys(envVars).forEach(key => {
    const regex = new RegExp(`process\\.env\\.${key}`, 'g');
    if (html.includes(`process.env.${key}`)) {
        html = html.replace(regex, `'${envVars[key]}'`);
        count++;
    }
});

fs.writeFileSync(htmlPath, html);
console.log(`✅ Done! Replaced ${count} variables.`);
