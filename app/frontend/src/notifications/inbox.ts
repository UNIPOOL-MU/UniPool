import type { PeopleNotification } from "@/src/api/people";
const listeners = new Set<() => void>();
let unread = 0;
export const notificationInbox = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot: () => unread,
  publish(items: PeopleNotification[], extraUnread = 0) { unread = items.filter(item => !item.read_at).length + extraUnread; listeners.forEach(fn => fn()); },
  setUnread(value: number) { unread = Math.max(0, value); listeners.forEach(fn => fn()); },
};
