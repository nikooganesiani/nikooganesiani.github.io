const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { transformSync } = require('esbuild');

const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
// The default script format preserves top-level identifiers for other scripts and HTML handlers.
const minify = code => transformSync(code, { minify: true, charset: 'utf8', target: 'es2020', legalComments: 'inline' }).code;
function optimizeSite(root = path.resolve(__dirname, '../_site')) {
  const manifestPath = path.join(root, 'assets/build-manifest.json');
  if (fs.existsSync(manifestPath) && fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('data-enka-source=')) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  const directory = path.join(root, 'assets/compiled');
  fs.mkdirSync(directory, { recursive: true });
  const manifest = { bundles: {}, styles: {}, inline: {}, data: [] };
  const transformed = new Map();
  function emit(code, extension, sources) {
    const url = '/assets/compiled/' + digest(code) + '.' + extension;
    fs.writeFileSync(path.join(root, url), code);
    if (sources) manifest.bundles[url] = sources;
    return url;
  }
  const css = '/assets/css/style.css';
  manifest.styles[css] = emit(fs.readFileSync(path.join(root, css)), 'css');
  // Local service mocks and the analytics script's DOM identity stay intact.
  const excluded = new Set(['/assets/js/main/config.js', '/assets/js/global/order-intake.js', '/capi.js']);
  const boundaries = new Set(['/assets/js/main/catalog-listing.js', '/assets/js/global/mobile-nav.js', '/assets/js/global/recommendation-engine.js']);
  const script = /<script src="(\/[^"?]+\.js)" defer><\/script>/g;
  let pages = 0;
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'assets') visit(file); continue; }
      if (!entry.name.endsWith('.html')) continue;
      let html = fs.readFileSync(file, 'utf8');
      // Shared build-time store data belongs in the browser cache, rather than
      // being parsed from a fresh copy of every product and information page.
      html = html.replace(/<script>\s*(window\.CATALOG_STRUCTURE\s*=[\s\S]*?)<\/script>/g, (_, code) => {
        const url = emit(minify(code), 'js');
        if (!manifest.data.includes(url)) manifest.data.push(url);
        return `<script src="${url}" defer></script>`;
      });
      const theme = '/assets/js/global/theme.js';
      const themeTag = `<script src="${theme}"></script>`;
      if (html.includes(themeTag)) {
        const code = minify(fs.readFileSync(path.join(root, theme), 'utf8')).replace(/<\/script/gi, '<\\/script');
        manifest.inline[theme] = digest(code);
        html = html.replace(themeTag, () => `<script data-enka-source="${theme}">${code}</script>`);
      }
      const matches = [...html.matchAll(script)];
      const groups = []; let group = [];
      for (const match of matches) {
        const previous = group.at(-1);
        if (excluded.has(match[1]) || manifest.data.includes(match[1]) || boundaries.has(match[1]) || (previous && html.slice(previous.index + previous[0].length, match.index).trim())) {
          if (group.length) groups.push(group);
          group = [];
        }
        if (!excluded.has(match[1]) && !manifest.data.includes(match[1])) group.push(match);
      }
      if (group.length) groups.push(group);
      for (const items of groups.reverse()) {
        const sources = items.map(match => match[1]);
        const key = sources.join('\n');
        if (!transformed.has(key)) transformed.set(key, minify(sources.map(source => fs.readFileSync(path.join(root, source), 'utf8')).join('\n;\n')));
        const code = transformed.get(key);
        const url = emit(code, 'js', sources);
        const start = items[0].index; const last = items.at(-1);
        html = html.slice(0, start) + `<script src="${url}" defer></script>` + html.slice(last.index + last[0].length);
      }
      html = html.replaceAll(`href="${css}"`, `href="${manifest.styles[css]}"`);
      fs.writeFileSync(file, html); pages++;
    }
  }
  visit(root);
  fs.writeFileSync(path.join(root, 'assets/build-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Optimized ${pages} pages; ${Object.keys(manifest.bundles).length} shared JavaScript bundles.`);
  return manifest;
}
module.exports = { optimizeSite, digest };
if (require.main === module) optimizeSite();
