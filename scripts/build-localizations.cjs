const fs = require('node:fs');
const path = require('node:path');
function buildLocalizations(root = process.cwd()) {
  const file = path.join(root, 'assets/i18n/translations.json');
  if (!fs.existsSync(file)) return;
  const dictionary = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [source, entries] of Object.entries(dictionary)) for (const locale of ['ru', 'en']) {
    if (typeof entries[locale] !== 'string' || !entries[locale].trim() || /[\u10a0-\u10ff]/.test(entries[locale])) throw Error('Missing ' + locale + ' translation: ' + source.slice(0, 90));
  }
  const sorted = Object.fromEntries(Object.entries(dictionary).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  fs.writeFileSync(path.join(root, 'assets/i18n/data.js'), 'window.ENKA_TRANSLATIONS = ' + JSON.stringify(sorted).replace(/</g, '\\u003c') + ';\n');
  return Object.keys(sorted).length;
}
module.exports = { buildLocalizations };
if (require.main === module) console.log('Saved RU/EN translations:', buildLocalizations());
