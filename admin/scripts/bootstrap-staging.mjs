// Creates NEW staging resources only. Never targets STORE_CATALOG/catalog-images.
// Authentication stays in Wrangler's normal OAuth session, never in this file.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createDocument } from '../public/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(root, '..');
const directory = path.join(workspace, '.local/admin');
fs.mkdirSync(directory, { recursive: true });
const markerPath = path.join(directory, 'cloudflare-staging.json');
const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : { namespaceTitle: 'ENKA_ADMIN_V2_STAGING', bucketName: 'enka-admin-images-staging', workerName: 'enka-admin-v2-staging' };
if (marker.namespaceTitle !== 'ENKA_ADMIN_V2_STAGING' || marker.bucketName !== 'enka-admin-images-staging' || marker.workerName !== 'enka-admin-v2-staging') throw Error('Файл подготовки не соответствует тестовому окружению.');
const saveMarker = () => fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
function run(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 5000000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); throw Error('Команда Cloudflare завершилась ошибкой. Исходный магазин не изменялся.'); }
  return result.stdout;
}
const flag = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ''; };
const catalogPath = path.resolve(flag('--catalog-file') || path.join(directory, 'seed.catalog.json'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));
createDocument(catalog);
const who = run(['whoami']);
if (/not authenticated|not logged in/i.test(who)) throw Error('Сначала выполните: pnpm --dir admin exec wrangler login');
if (!marker.namespaceId) {
  const output = run(['kv', 'namespace', 'create', marker.namespaceTitle]);
  const match = output.match(/\bid["']?\s*[:=]\s*["']([a-f0-9]{32})["']/i);
  if (!match) { process.stdout.write(output); throw Error('Не удалось прочитать ID нового namespace. Не повторяйте создание: сохраните его ID в .local/admin/cloudflare-staging.json и продолжите.'); }
  marker.namespaceId = match[1]; saveMarker();
}
const namespacesOutput = run(['kv', 'namespace', 'list']).replace(/\u001b\[[0-9;]*m/g, '');
let namespaces;
try { namespaces = JSON.parse(namespacesOutput.slice(namespacesOutput.indexOf('['), namespacesOutput.lastIndexOf(']') + 1)); } catch { throw Error('Не удалось проверить имя тестового namespace. Импорт не выполнялся.'); }
const namespace = namespaces.find(item => item.id === marker.namespaceId);
if (!namespace || !/^(?:[a-z0-9-]+-)?ENKA_ADMIN_V2_STAGING$/.test(namespace.title)) throw Error('ID namespace не принадлежит отдельному ENKA_ADMIN_V2_STAGING. Импорт запрещён.');
if (!marker.bucketCreated) { run(['r2', 'bucket', 'create', marker.bucketName]); marker.bucketCreated = true; saveMarker(); }
if (!marker.seeded) {
  run(['kv', 'key', 'put', 'catalog', '--path', catalogPath, '--namespace-id', marker.namespaceId, '--remote']);
  marker.seeded = true; marker.seededAt = new Date().toISOString(); saveMarker();
}
if (!marker.environmentMarker) { marker.environmentMarker = randomUUID(); saveMarker(); }
run(['kv', 'key', 'put', 'enka-admin:staging-marker', marker.environmentMarker, '--namespace-id', marker.namespaceId, '--remote']);
const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.example.jsonc'), 'utf8'));
config.kv_namespaces[0].id = marker.namespaceId;
config.vars.STAGING_MARKER = marker.environmentMarker;
config.routes = [{ pattern: 'admin-staging.enkaelectronics.com.ge', custom_domain: true }];
const teamDomain = flag('--team-domain'); const audience = flag('--audience');
if (teamDomain) config.vars.ACCESS_TEAM_DOMAIN = teamDomain;
if (audience) config.vars.ACCESS_AUD = audience;
const outputPath = path.join(root, 'wrangler.local.jsonc');
if (!fs.existsSync(outputPath)) fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
console.log(`Создана тестовая копия: ${marker.namespaceTitle} и ${marker.bucketName}.`);
console.log('Рабочие STORE_CATALOG и catalog-images не изменялись.');
console.log('Конфигурация: admin/wrangler.local.jsonc');
console.log('Перед публикацией настройте Cloudflare Access и замените ACCESS_TEAM_DOMAIN / ACCESS_AUD.');
console.log('Скрипт намеренно не публикует Worker. Следующий шаг описан в admin/README.md.');
