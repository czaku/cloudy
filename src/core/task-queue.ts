import type { Task, TaskStatus } from './types.js';
import { getReadyTasks } from '../planner/dependency-graph.js';

export class TaskQueue {
  private tasks: Map<string, Task>;

  constructor(tasks: Task[]) {
    this.tasks = new Map(tasks.map((t) => [t.id, { ...t }]));
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getReadyTasks(): Task[] {
    return getReadyTasks(this.getAllTasks());
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  updateStatus(id: string, status: TaskStatus): void {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    task.status = status;

    if (status === 'in_progress') {
      task.startedAt = new Date().toISOString();
    }
    if (status === 'completed' || status === 'completed_without_changes' || status === 'failed') {
      task.completedAt = new Date().toISOString();
    }
  }

  setCheckpoint(id: string, sha: string): void {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    task.checkpointSha = sha;
  }

  setError(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    task.error = error;
  }

  incrementRetry(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    task.retries++;
    return task.retries <= task.maxRetries;
  }

  isComplete(): boolean {
    return this.getAllTasks().every(
      (t) => t.status === 'completed' || t.status === 'completed_without_changes' || t.status === 'skipped',
    );
  }

  hasFailures(): boolean {
    return this.getAllTasks().some((t) => t.status === 'failed');
  }

  /**
   * Returns true when ALL remaining pending tasks are permanently blocked
   * because their dependency chains contain at least one failed task.
   * Returns false if even one pending task could still become ready.
   */
  isDeadlocked(): boolean {
    const pending = this.getAllTasks().filter((t) => t.status === 'pending');
    if (pending.length === 0) return false;
    const deadlocked = this.getDeadlockedTasks();
    return deadlocked.length === pending.length;
  }

  /**
   * Returns the set of pending tasks that can never become ready because
   * at least one dependency (direct or transitive) has failed.
   */
  getDeadlockedTasks(): Task[] {
    const tasks = this.getAllTasks();
    const blocked = new Set<string>();

    // Iterative fixed-point: mark tasks that depend on failed/blocked tasks
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of tasks) {
        if (task.status !== 'pending' || blocked.has(task.id)) continue;
        const isBlocked = task.dependencies.some((dep) => {
          const depTask = tasks.find((t) => t.id === dep);
          return depTask?.status === 'failed' || blocked.has(dep);
        });
        if (isBlocked) {
          blocked.add(task.id);
          changed = true;
        }
      }
    }

    // Return only the tasks that are pending AND blocked
    return tasks.filter((t) => t.status === 'pending' && blocked.has(t.id));
  }

  /**
   * Dynamically add a new task (e.g. from a subtask parser).
   * Validates that all declared dependencies already exist in the queue.
   */
  addTask(task: Task): void {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task "${task.id}" already exists in queue`);
    }
    for (const dep of task.dependencies) {
      if (!this.tasks.has(dep)) {
        throw new Error(`Task "${task.id}" depends on unknown task "${dep}"`);
      }
    }
    this.tasks.set(task.id, { ...task });
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    const all = this.getAllTasks();
    const completed = all.filter((t) => t.status === 'completed').length;
    const completedWithoutChanges = all.filter((t) => t.status === 'completed_without_changes').length;
    return {
      completed: completed + completedWithoutChanges,
      total: all.length,
      percentage: all.length > 0 ? Math.round(((completed + completedWithoutChanges) / all.length) * 100) : 0,
    };
  }
}
