import type { Task } from './types.js';
import { TaskQueue } from './task-queue.js';
import {
  createWorktree,
  mergeWorktree,
  removeWorktree,
  cleanupAllWorktrees,
  type WorktreeInfo,
} from '../git/worktree.js';
import { log } from '../utils/logger.js';

export interface ParallelSchedulerOptions {
  maxParallel: number;
  executeTask: (task: Task, worktreeCwd?: string) => Promise<void>;
  /** When true, each task runs in its own git worktree for isolation. */
  useWorktrees?: boolean;
  /** The project root directory (required when useWorktrees is true). */
  cwd?: string;
}

/**
 * Executes tasks in parallel, respecting dependencies and concurrency limits.
 * Optionally isolates each task in its own git worktree to prevent conflicts.
 */
export class ParallelScheduler {
  private queue: TaskQueue;
  private maxParallel: number;
  private executeTask: (task: Task, worktreeCwd?: string) => Promise<void>;
  private useWorktrees: boolean;
  private cwd: string | undefined;
  private running = new Set<string>();
  private activeWorktrees = new Map<string, WorktreeInfo>();
  private aborted = false;
  private inFlight = new Map<string, Promise<void>>();
  private onTaskDone: (() => void) | null = null;
  private taskErrors: Error[] = [];

  constructor(queue: TaskQueue, options: ParallelSchedulerOptions) {
    this.queue = queue;
    this.maxParallel = options.maxParallel;
    this.executeTask = options.executeTask;
    this.useWorktrees = options.useWorktrees ?? false;
    this.cwd = options.cwd;

    if (this.useWorktrees && !this.cwd) {
      throw new Error(
        'ParallelScheduler: cwd is required when useWorktrees is enabled',
      );
    }
  }

  async run(): Promise<void> {
    try {
      await this.executeLoop();
    } finally {
      // Clean up any remaining worktrees on exit
      if (this.useWorktrees && this.activeWorktrees.size > 0) {
        await this.cleanupActiveWorktrees();
      }
    }
  }

  abort(): void {
    this.aborted = true;
  }

  private async executeLoop(): Promise<void> {
    while (!this.queue.isComplete() && !this.aborted && this.taskErrors.length === 0) {
      if (this.queue.hasFailures()) {
        // Wait for running tasks to finish, then stop
        if (this.running.size > 0) {
          await this.waitForAny();
          continue;
        }
        break;
      }

      const ready = this.queue
        .getReadyTasks()
        .filter((t) => !this.running.has(t.id));

      if (ready.length === 0 && this.running.size === 0) {
        // Nothing to run and nothing running - deadlock or done
        break;
      }

      if (ready.length === 0) {
        // Wait for a running task to complete
        await this.waitForAny();
        continue;
      }

      // Launch tasks up to maxParallel
      const toStart = ready.slice(0, this.maxParallel - this.running.size);

      for (const task of toStart) {
        this.running.add(task.id);
        const p = this.runTask(task).then(
          () => {
            this.running.delete(task.id);
            this.inFlight.delete(task.id);
            this.onTaskDone?.();
          },
          (err: unknown) => {
            this.running.delete(task.id);
            this.inFlight.delete(task.id);
            this.taskErrors.push(err instanceof Error ? err : new Error(String(err)));
            this.onTaskDone?.();
          },
        );
        this.inFlight.set(task.id, p);
      }

      if (this.inFlight.size > 0) {
        await this.waitForAny();
      }
    }

    // Wait for all remaining in-flight tasks
    if (this.inFlight.size > 0) {
      await Promise.allSettled(this.inFlight.values());
    }

    // Propagate any task errors (e.g. merge conflicts, unhandled throws)
    if (this.taskErrors.length > 0) {
      throw this.taskErrors[0];
    }
  }

  /**
   * Run a single task, optionally in a worktree.
   * Handles worktree creation, task execution, merge, and cleanup.
   */
  private async runTask(task: Task): Promise<void> {
    if (!this.useWorktrees) {
      return this.executeTask(task);
    }

    const cwd = this.cwd!;
    let worktree: WorktreeInfo | undefined;

    try {
      // Create an isolated worktree for this task
      worktree = await createWorktree(cwd, task.id);
      this.activeWorktrees.set(task.id, worktree);

      // Execute the task within the worktree directory
      await this.executeTask(task, worktree.path);

      // Merge changes back into the main branch
      const result = await mergeWorktree(cwd, worktree);

      if (result.conflict) {
        throw new Error(
          `Merge conflict for task "${task.id}": changes remain on branch "${worktree.branch}". Resolve the conflict and re-run.`,
        );
      }
    } finally {
      // Clean up the worktree regardless of outcome
      if (worktree) {
        try {
          await removeWorktree(cwd, worktree);
        } catch (err) {
          await log.warn(
            `Failed to remove worktree for task "${task.id}": ${err}`,
          );
        }
        this.activeWorktrees.delete(task.id);
      }
    }
  }

  /**
   * Clean up any worktrees still tracked as active.
   * Called during shutdown / error recovery.
   */
  private async cleanupActiveWorktrees(): Promise<void> {
    const cwd = this.cwd!;
    for (const [taskId, worktree] of this.activeWorktrees) {
      try {
        await removeWorktree(cwd, worktree);
      } catch (err) {
        await log.warn(
          `Cleanup: failed to remove worktree for task "${taskId}": ${err}`,
        );
      }
    }
    this.activeWorktrees.clear();
  }

  private waitForAny(): Promise<void> {
    if (this.inFlight.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.onTaskDone = () => {
        this.onTaskDone = null;
        resolve();
      };
    });
  }
}
