type EventHandler = (payload: unknown) => void | Promise<void>;
import { afterCommit } from './db';

const handlers = new Map<string, EventHandler[]>();

export function onEvent<T = unknown>(event: string, handler: (payload: T) => void | Promise<void>) {
  const list = handlers.get(event) ?? [];
  list.push(handler as EventHandler);
  handlers.set(event, list);
  return ()=>{const current=handlers.get(event) ?? [];handlers.set(event,current.filter(h=>h!==handler));};
}

export function emitEvent(event: string, payload: unknown) {
  afterCommit(()=>{
  const list = handlers.get(event) ?? [];
  for (const handler of list) {
    try {
      const res = handler(payload);
      if (res instanceof Promise) {
        res.catch((err) => console.error(`Error in event handler for ${event}:`, err));
      }
    } catch (err) {
      console.error(`Error in event handler for ${event}:`, err);
    }
  }
  });
}
