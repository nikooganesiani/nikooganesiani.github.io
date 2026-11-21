const fs = require('node:fs');
const path = require('node:path');

function buildCategoryPages(categories, root = process.cwd()) {
  const directory = path.join(root, '_pages/generated-categories');
  fs.mkdirSync(directory, { recursive: true });
  const current = new Set();
  const valid = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
  for (const category of categories) {
    for (const id of [category.id, ...(category.aliases || [])].filter(valid)) {
      const sections = new Map([['', '']]);
      for (const section of category.subs || []) {
        for (const alias of [section.id, ...(section.aliases || [])].filter(valid)) sections.set(alias, section.id);
      }
      for (const [sub, canonicalSub] of sections) {
        const route = '/category/' + id + '/' + (sub ? sub + '/' : '');
        const canonical = '/category/' + category.id + '/' + (canonicalSub ? canonicalSub + '/' : '');
        const file = id + (sub ? '--' + sub : '') + '.html';
        current.add(file);
        fs.writeFileSync(path.join(directory, file), `---
generated: true
layout: default
listing_mode: category
listing_category: "${category.id}"
${canonicalSub ? `listing_subcategory: "${canonicalSub}"\n` : ''}${canonical !== route ? `canonical_path: ${canonical}\nsitemap: false\n` : ''}title: "კატალოგი"
permalink: ${route}
---

<div class="{% include listing/page-classes.html %}">
  {% include pages/categorypage.html %}
</div>
`);
      }
    }
  }
  for (const file of fs.readdirSync(directory)) {
    if (!current.has(file) && file.endsWith('.html') && fs.readFileSync(path.join(directory, file), 'utf8').startsWith('---\ngenerated: true\n')) fs.unlinkSync(path.join(directory, file));
  }
  return current.size;
}
module.exports = { buildCategoryPages };
