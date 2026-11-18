const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function buildLocalizations(root = process.cwd()) {
  const file = path.join(root, 'assets/i18n/translations.json');
  if (!fs.existsSync(file)) return;
  const dictionary = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [source, entries] of Object.entries(dictionary)) for (const locale of ['ru', 'en']) {
    if (typeof entries[locale] !== 'string' || !entries[locale].trim() || /[\u10a0-\u10ff]/.test(entries[locale])) throw Error('Missing ' + locale + ' translation: ' + source.slice(0, 90));
  }
  const sorted = Object.fromEntries(Object.entries(dictionary).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  fs.writeFileSync(path.join(root, 'assets/i18n/data.js'), 'window.ENKA_TRANSLATIONS = ' + JSON.stringify(sorted).replace(/</g, '\\u003c') + ';\n');
  const urls = {};
  for (const locale of ['ru', 'en']) {
    const json = JSON.stringify(Object.fromEntries(Object.entries(sorted).map(([source, entries]) => [source, { [locale]: entries[locale] }])));
    const hash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
    const name = `${locale}.${hash}.json`;
    const directory = path.join(root, 'assets/i18n');
    for (const old of fs.readdirSync(directory)) if (new RegExp('^' + locale + '\\.[a-f0-9]{16}\\.json$').test(old) && old !== name) fs.unlinkSync(path.join(directory, old));
    fs.writeFileSync(path.join(directory, name), json);
    urls[locale] = '/assets/i18n/' + name;
  }
  if (fs.existsSync(path.join(root, '_data'))) fs.writeFileSync(path.join(root, '_data/i18n.json'), JSON.stringify(urls));
  return Object.keys(sorted).length;
}
module.exports = { buildLocalizations };
if (require.main === module) console.log('Saved RU/EN translations:', buildLocalizations());
