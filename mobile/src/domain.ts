export type Category = '일상' | '업무' | '건강';
export type Todo = {
  id: string; title: string; category: Category; done: boolean;
  dueDate: string | null; reminderAt?: string | null; source?: { provider: string; externalId: string }; createdAt?: string; completedAt?: string | null;
};
export type Draft = { title: string; dueDate: string | null; category: Category; reminderAt?: string | null };
export type Connection = { mode: 'demo' } | { mode: 'cloud'; baseUrl: string };
export const COMPLETION_DELAY = 4000;
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateDraft(draft: Draft): Draft {
  const title = draft.title.trim();
  if (!title || title.length > 120) throw new Error('할 일을 120자 이내로 적어주세요.');
  if (!validDate(draft.dueDate)) throw new Error('날짜를 YYYY-MM-DD 형식으로 선택해주세요.');
  if (draft.reminderAt != null && (!Number.isFinite(Date.parse(draft.reminderAt)) || new Date(draft.reminderAt).toISOString() !== draft.reminderAt)) throw new Error('알림 시간을 확인해주세요.');
  return { ...draft, title };
}
export function serverUrl(input: string, allowLocal = false): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('https://로 시작하는 서버 주소를 입력해주세요.'); }
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('로그인 정보나 경로가 없는 HTTPS 서버 주소를 입력해주세요.');
  }
  return url.origin;
}
export function visibleTodos(todos: Todo[], pending: Record<string, number>, now = Date.now()): Todo[] {
  return todos.filter(todo => !todo.done || (pending[todo.id] ?? 0) > now);
}
export function completedTodos(todos: Todo[]): Todo[] {
  return todos.filter(todo => todo.done).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}
export function monthDays(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - start.getDay() + 1));
}
export function sampleTodos(): Todo[] {
  const today = dateKey(new Date());
  return [
    { id: 'demo-1', title: '오늘 가장 중요한 일 정하기', category: '일상', done: true, dueDate: today, completedAt: new Date().toISOString() },
    { id: 'demo-2', title: '팀 회의 자료 준비하기', category: '업무', done: false, dueDate: today },
    { id: 'demo-3', title: '가볍게 30분 산책하기', category: '건강', done: false, dueDate: today },
  ];
}
export function parseTodos(value: unknown): Todo[] {
  if (!Array.isArray(value) || !value.every(todo => todo && typeof todo.id === 'string' && typeof todo.title === 'string' && typeof todo.done === 'boolean' && (todo.dueDate == null || (typeof todo.dueDate === 'string' && validDate(todo.dueDate))) && (todo.reminderAt == null || (typeof todo.reminderAt === 'string' && Number.isFinite(Date.parse(todo.reminderAt)))) && (todo.completedAt == null || (typeof todo.completedAt === 'string' && Number.isFinite(Date.parse(todo.completedAt)))))) {
    throw new Error('서버의 할 일 데이터를 읽을 수 없어요.');
  }
  return value.map(todo => ({ ...todo, dueDate: todo.dueDate ?? null, category: ['일상', '업무', '건강'].includes(todo.category) ? todo.category : '일상' }));
}

export function searchTodos(todos: Todo[], query: string, filter: 'all' | 'open' | 'done' = 'all'): Todo[] {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko-KR');
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return todos.filter(todo => (filter === 'all' || (filter === 'done' ? todo.done : !todo.done)) && words.every(word => normalize(todo.title).includes(word))).sort((a, b) => Number(a.done) - Number(b.done) || (a.done ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '') : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')));
}
