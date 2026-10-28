import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderPlan, reconcileReminders } from './reminder-plan.ts';
import type { Todo } from './domain.ts';
const NOW = Date.parse('2029-01-01T00:00:00Z');
const base: Todo = { id: 'one', title: '알림 할 일', category: '일상', dueDate: '2030-01-01', done: false, reminderAt: '2030-01-01T00:00:00.000Z' };
test('reminders include only future active todos, are account scoped, ordered and capped at 60', () => {
 const values = [base, { ...base, id: 'done', done: true }, { ...base, id: 'past', reminderAt: '2000-01-01T00:00:00.000Z' }];
 assert.equal(reminderPlan(values, 'alice', true, NOW).length, 1); assert.equal(reminderPlan(values, null, true, NOW).length, 0); assert.equal(reminderPlan(values, 'alice', false, NOW).length, 0);
 assert.notEqual(reminderPlan([base], 'alice', true, NOW)[0].id, reminderPlan([base], 'bob', true, NOW)[0].id);
 assert.equal(reminderPlan(Array.from({ length: 100 }, (_, id) => ({ ...base, id: String(id) })), 'alice', true, NOW).length, 60);
});
test('completion, edits and account changes cancel only this app’s notifications and do not duplicate schedules', async () => {
 let existing: { identifier: string; content: { body?: string; data: Record<string, unknown> } }[] = [{ identifier: 'other', content: { data: { app: 'other-feature' } } }];
 const cancelled: string[] = [], scheduled: string[] = [];
 const client = { getAllScheduledNotificationsAsync: async () => existing, cancelScheduledNotificationAsync: async (id: string) => { cancelled.push(id); existing = existing.filter(item => item.identifier !== id); }, scheduleNotificationAsync: async (value: { identifier: string; content: { body: string; data: Record<string, unknown> } }) => { scheduled.push(value.identifier); existing.push(value); return value.identifier; } };
 const plan = reminderPlan([base], 'alice', true, NOW); await reconcileReminders(client, plan, date => date); await reconcileReminders(client, plan, date => date); assert.equal(scheduled.length, 1);
 await reconcileReminders(client, reminderPlan([{ ...base, title: '제목 변경' }], 'alice', true, NOW), date => date); assert.equal(cancelled.length, 1); assert.equal(scheduled.length, 2);
 await reconcileReminders(client, [], date => date); assert.equal(existing.length, 1); assert.equal(existing[0].identifier, 'other');
});
