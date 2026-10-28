import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openStore, validDate, validTitle } from '../server/store.js';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--email') throw new Error('사용법: npm run data:import -- --email 가져올계정이메일');
const directory = process.env.DATA_DIR || fileURLToPath(new URL('../data', import.meta.url));
const items = JSON.parse(await readFile(join(directory, 'todos.json'), 'utf8'));
if (!Array.isArray(items) || !items.every(item => item && validTitle(item.title) && typeof item.done === 'boolean' && validDate(item.dueDate ?? null) && (item.completedAt == null || Number.isFinite(Date.parse(item.completedAt))))) throw new Error('기존 할 일 파일을 확인해주세요. 원본은 변경하지 않았어요.');
const store = await openStore(directory);
try { const result = store.importLegacy(args[1].trim().toLowerCase(), items.map(item => ({ title: item.title.trim(), done: item.done, category: ['일상','업무','건강'].includes(item.category) ? item.category : '일상', dueDate: item.dueDate ?? null, ...(item.completedAt ? { completedAt: item.completedAt } : {}) }))); console.log(result.alreadyImported ? '이미 가져온 파일이에요. 중복으로 추가하지 않았어요.' : `${result.imported}개를 가져왔어요. 원본 파일은 보존했어요.`); } finally { store.close(); }
