import { request } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseTodos, sampleTodos, validateDraft } from './domain';
import type { Connection, Draft, Todo } from './domain';
export const CONNECTION_KEY = 'duckduck.mobile.connection.v1';
const DEMO_KEY = 'duckduck.mobile.demo.todos.v1';
export type Patch = Partial<Pick<Todo, 'title' | 'done' | 'dueDate' | 'reminderAt'>>;
export interface Repository {
  list(): Promise<Todo[]>;
  create(draft: Draft): Promise<Todo>;
  update(id: string, patch: Patch): Promise<Todo>;
  remove(id: string): Promise<void>;
}
export function createRepository(connection: Connection): Repository {
  if (connection.mode === 'cloud') {
    const call = (path = '', method = 'GET', body?: unknown) => request(connection.baseUrl, '/api/todos' + path, method, body);
    return {
      list: async () => parseTodos(await call()),
      create: async draft => parseTodos([await call('', 'POST', validateDraft(draft))])[0],
      update: async (id, patch) => parseTodos([await call('/' + encodeURIComponent(id), 'PATCH', patch)])[0],
      remove: async id => { await call('/' + encodeURIComponent(id), 'DELETE'); },
    };
  }
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<Todo[]> {
    const value = await AsyncStorage.getItem(DEMO_KEY);
    if (value) return parseTodos(JSON.parse(value));
    const samples = sampleTodos();
    await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(samples));
    return samples;
  }
  function mutate<T>(operation: (items: Todo[]) => T): Promise<T> {
    const result = queue.then(async () => {
      const items = await read(); const output = operation(items);
      await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(items)); return output;
    });
    queue = result.catch(() => undefined); return result;
  }
  return {
    list: read,
    create: draft => mutate(items => {
      const todo: Todo = { ...validateDraft(draft), id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, done: false, createdAt: new Date().toISOString() };
      items.push(todo); return todo;
    }),
    update: (id, patch) => mutate(items => {
      const index = items.findIndex(todo => todo.id === id);
      if (index < 0) throw new Error('할 일을 찾을 수 없어요.');
      const previous = items[index];
      const next = { ...previous, ...patch };
      validateDraft(next);
      if (patch.done !== undefined) next.completedAt = patch.done ? (previous.done && previous.completedAt ? previous.completedAt : new Date().toISOString()) : null;
      items[index] = next; return next;
    }),
    remove: id => mutate(items => { const index = items.findIndex(todo => todo.id === id); if (index >= 0) items.splice(index, 1); }),
  };
}
