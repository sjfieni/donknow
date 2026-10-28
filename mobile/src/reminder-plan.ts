import type { Todo } from './domain';
export type Reminder = { id: string; todoId: string; title: string; at: string };
export function reminderPlan(todos: Todo[], owner: string | null, enabled: boolean, now = Date.now()): Reminder[] {
  if (!owner || !enabled) return [];
  return todos.filter(todo => !todo.done && typeof todo.reminderAt === 'string' && Number.isFinite(Date.parse(todo.reminderAt)) && Date.parse(todo.reminderAt) > now)
    .sort((a, b) => Date.parse(a.reminderAt!) - Date.parse(b.reminderAt!)).slice(0, 60)
    .map(todo => ({ id: `duckduck-${owner}-${todo.id}`, todoId: todo.id, title: todo.title, at: todo.reminderAt! }));
}
export type NotificationClient<Trigger> = {
  getAllScheduledNotificationsAsync(): Promise<{ identifier: string; content: { title?: string | null; body?: string | null; data?: Record<string, unknown> } }[]>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  scheduleNotificationAsync(value: { identifier: string; content: { title: string; body: string; data: Record<string, unknown> }; trigger: Trigger }): Promise<string>;
};
export async function reconcileReminders<Trigger>(client: NotificationClient<Trigger>, desired: Reminder[], trigger: (date: Date) => Trigger) {
  const existing = await client.getAllScheduledNotificationsAsync();
  const ours = existing.filter(item => item.content.data?.app === 'duckduck');
  const matches = (item: typeof ours[number], reminder: Reminder) => item.identifier === reminder.id && item.content.data?.at === reminder.at && item.content.body === reminder.title;
  for (const item of ours) if (!desired.some(reminder => matches(item, reminder))) await client.cancelScheduledNotificationAsync(item.identifier);
  for (const reminder of desired) if (!ours.some(item => matches(item, reminder))) await client.scheduleNotificationAsync({ identifier: reminder.id, content: { title: 'duckduck · 할 일', body: reminder.title, data: { app: 'duckduck', todoId: reminder.todoId, at: reminder.at } }, trigger: trigger(new Date(reminder.at)) });
}
