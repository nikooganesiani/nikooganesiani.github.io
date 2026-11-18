const fs = require('node:fs');
const path = require('node:path');

function buildCategoryPages(categories, root = process.cwd()) {
  const directory = path.join(root, '_pages/generated-categories');
  fs.mkdirSync(directory, { recursive: true });
  const current = new Set();
  const valid = value => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value);
  for (const category of categories) {
    for (const id of [category.id, ...(category.aliases || [])].filter(valid)) {
      const sections = ['', ...(category.subs || []).flatMap(sub => [sub.id, ...(sub.aliases || [])]).filter(valid)];
      for (const sub of new Set(sections)) {
        const route = '/category/' + id + '/' + (sub ? sub + '/' : '');
        const file = id + (sub ? '--' + sub : '') + '.html';
        current.add(file);
        fs.writeFileSync(path.join(directory, file), '---\ngenerated: true\nlayout: default\nlisting_mode: category\ntitle: "კატალოგი"\npermalink: ' + route + '\n---\n\n<div class="pb-20 animate-[fadeIn_0.4s_ease-out] overflow-x-clip selection:bg-blue-600 selection:text-white w-full max-w-store mx-auto pt-3 px-6 min-[1280px]:px-8 max-[640px]:px-4">\n  {% include pages/categorypage.html %}\n</div>\n');
      }
    }
  }
  for (const file of fs.readdirSync(directory)) {
    if (!current.has(file) && file.endsWith('.html') && fs.readFileSync(path.join(directory, file), 'utf8').startsWith('---\ngenerated: true\n')) fs.unlinkSync(path.join(directory, file));
  }
  return current.size;
}
module.exports = { buildCategoryPages };
