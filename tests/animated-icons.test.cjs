const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const icons = require('../_data/icons.json');
const sources = require('../_data/icon_sources.json');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/global/icon-markup.js'), 'utf8'), { window });

test('Every icon has local artwork, a source and identical server/client geometry', () => {
  assert.deepEqual(Object.keys(icons).sort(), Object.keys(sources).sort());
  for (const [name, body] of Object.entries(icons)) {
    assert.match(body, /^<(?:path|circle|rect|line|polygon|polyline)\b/);
    assert.ok(!/\bon\w+=|<script|<image|<use|\{/.test(body), name);
    assert.ok(window.EnkaIcons.render(name).includes('<g data-icon-body>' + body + '</g>'));
    assert.match(sources[name], /^https:\/\/(?:lucide-animated\.com|www\.heroicons-animated\.com|useanimations\.com)\//);
  }
});

test('Icon renderer contains invalid names, sizes, modes and untrusted class strings', () => {
  const result = window.EnkaIcons.render('__proto__', '" onload="alert(1)', '" onload="alert(1)', '"><script>');
  assert.match(result, /data-animated-icon="grid"/);
  assert.match(result, /width="20" height="20"/);
  assert.match(result, /data-icon-trigger="auto"/);
  assert.ok(!result.includes('<script>'));
  assert.ok(!result.includes('onload='));
  assert.match(result, /aria-hidden="true" focusable="false"/);
});

test('Server-rendered category fallback icons also use the animated set', () => {
  for (const [name, category] of Object.entries(require('../admin/public/store-icons.json'))) {
    assert.equal(category.icon, window.EnkaIcons.render(name, 24));
  }
});
