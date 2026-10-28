import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTodos, completedTodos, dateKey, monthDays, parseTodos, serverUrl, validDate, validateDraft, visibleTodos } from './domain.ts';
import type { Todo } from './domain.ts';
const todo: Todo = { id: 'one', title: '회의 준비', done: false, dueDate: '2026-10-27', category: '업무' };
test('completion stays visible for four seconds and restores to Todo', () => {
  const done = { ...todo, done: true, completedAt: '2026-10-27T08:00:00Z' };
  assert.equal(visibleTodos([done], { one: 4000 }, 3999).length, 1);
  assert.equal(visibleTodos([done], { one: 4000 }, 4000).length, 0);
  assert.equal(completedTodos([done]).length, 1);
  assert.equal(visibleTodos([todo], {}, 5000).length, 1);
  assert.equal(completedTodos([todo]).length, 0);
});
test('log orders completion timestamps and preserves legacy completed records', () => {
  const records = [{ ...todo, done: true }, { ...todo, id: 'later', done: true, completedAt: '2026-10-28T08:00:00Z' }, { ...todo, id: 'earlier', done: true, completedAt: '2026-10-27T08:00:00Z' }];
  assert.deepEqual(completedTodos(records).map(item => item.id), ['later', 'earlier', 'one']);
});
test('six-week calendar spans year boundaries without UTC date shifts', () => {
  const dates = monthDays(new Date(2026, 0, 1));
  assert.equal(dates.length, 42); assert.equal(dates[0].getDay(), 0);
  assert.equal(dateKey(dates[0]), '2025-12-28'); assert.equal(dateKey(dates[41]), '2026-02-07');
  assert.equal(monthDays(new Date(2028, 1, 1)).filter(date => date.getMonth() === 1).length, 29);
});
test('draft rejects empty titles, overflow and impossible dates', () => {
  assert.equal(validateDraft({ ...todo, title: '  회의 준비  ' }).title, '회의 준비');
  for (const title of ['', '  ', 'x'.repeat(121)]) assert.throws(() => validateDraft({ ...todo, title }));
  for (const date of ['2026-02-29', '2026-04-31', 'not-a-date']) assert.equal(validDate(date), false);
  assert.equal(validDate('2028-02-29'), true); assert.equal(validDate(null), true);
});
test('server connection requires a clean HTTPS origin; loopback is development-only', () => {
  assert.equal(serverUrl(' https://example.test/ '), 'https://example.test');
  for (const value of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?token=secret', 'https://example.test#part', 'file:///tmp']) assert.throws(() => serverUrl(value));
  assert.throws(() => serverUrl('http://localhost:3000'));
  assert.equal(serverUrl('http://localhost:3000', true), 'http://localhost:3000');
});
test('API responses must contain usable todos and completion timestamps', () => {
  assert.equal(parseTodos([{ ...todo, dueDate: undefined }])[0].dueDate, null);
  assert.throws(() => parseTodos({ data: [] }));
  assert.throws(() => parseTodos([{ ...todo, done: 'yes' }]));
  assert.throws(() => parseTodos([{ ...todo, completedAt: 'invalid' }]));
});

test('record search normalizes Korean/Latin input, matches every word, separates completion and keeps input order intact', () => {
  const items: Todo[] = [
    { ...todo, id: 'late', title: '회의 API 자료', dueDate: '2030-01-03' },
    { ...todo, id: 'done', title: '회의 ＡＰＩ 자료', done: true, completedAt: '2030-01-01T00:00:00Z' },
    { ...todo, id: 'early', title: '회의 api 자료', dueDate: '2030-01-01' },
    { ...todo, id: 'unrelated', title: '회의 준비' },
  ];
  assert.deepEqual(searchTodos(items, '  자료  Api ').map(item => item.id), ['early', 'late', 'done']);
  assert.deepEqual(searchTodos(items, '회의 api', 'done').map(item => item.id), ['done']);
  assert.deepEqual(searchTodos(items, '회의 api', 'open').map(item => item.id), ['early', 'late']);
  assert.deepEqual(searchTodos(items, '없는 단어'), []);
  assert.deepEqual(searchTodos(items, '   '), []);
  assert.deepEqual(items.map(item => item.id), ['late', 'done', 'early', 'unrelated']);
});
