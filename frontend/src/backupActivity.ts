import type { Task } from "./api/types";

// Map each backup id to the most recent task acting on it. The task list arrives newest-first, so the
// first one seen per backup wins. Tasks not linked to a backup (e.g. volume resets) are ignored.
export function latestTaskByBackup(tasks: Task[] | undefined): Map<string, Task> {
  const map = new Map<string, Task>();

  for (const task of tasks ?? []) {
    if (task.backupId && !map.has(task.backupId)) {
      map.set(task.backupId, task);
    }
  }

  return map;
}
