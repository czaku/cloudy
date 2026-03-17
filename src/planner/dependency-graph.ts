import type { Task } from '../core/types.js';

/**
 * Validate that tasks form a valid DAG (no cycles, all deps exist).
 */
export function validateDependencyGraph(tasks: Task[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const ids = new Set(tasks.map((t) => t.id));

  // Check all dependencies reference existing tasks
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!ids.has(dep)) {
        errors.push(
          `Task "${task.id}" depends on "${dep}" which does not exist`,
        );
      }
      if (dep === task.id) {
        errors.push(`Task "${task.id}" depends on itself`);
      }
    }
  }

  // Check for cycles using DFS
  const cycle = detectCycle(tasks);
  if (cycle) {
    errors.push(`Dependency cycle detected: ${cycle.join(' -> ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Topological sort of tasks based on dependencies.
 * Returns task IDs in execution order.
 */
export function topologicalSort(tasks: Task[]): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const task = taskMap.get(id);
    if (!task) return;

    for (const dep of task.dependencies) {
      visit(dep);
    }

    result.push(id);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}

/**
 * Get tasks that are ready to execute (all dependencies completed).
 */
export function getReadyTasks(tasks: Task[]): Task[] {
  const completedIds = new Set(
    tasks.filter((t) => t.status === 'completed' || t.status === 'completed_without_changes').map((t) => t.id),
  );

  return tasks.filter(
    (t) =>
      t.status === 'pending' &&
      t.dependencies.every((dep) => completedIds.has(dep)),
  );
}

/**
 * Compute the transitive dependency closure for a given target task.
 * Returns a Set containing the target ID and all task IDs it transitively depends on.
 */
export function getTransitiveDeps(tasks: Task[], targetId: string): Set<string> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const result = new Set<string>();

  function walk(id: string): void {
    if (result.has(id)) return;
    result.add(id);
    const task = taskMap.get(id);
    if (!task) return;
    for (const dep of task.dependencies) {
      walk(dep);
    }
  }

  walk(targetId);
  return result;
}

/**
 * Render an ASCII dependency tree for the given tasks.
 * Diamond deps (task referenced by multiple parents) show `(↑ task-N)` on second occurrence.
 */
export function renderAsciiGraph(tasks: Task[]): string {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Build reverse dep map: taskId -> which tasks depend on it
  const childrenOf = new Map<string, string[]>();
  for (const task of tasks) {
    if (!childrenOf.has(task.id)) childrenOf.set(task.id, []);
    for (const dep of task.dependencies) {
      if (!childrenOf.has(dep)) childrenOf.set(dep, []);
      childrenOf.get(dep)!.push(task.id);
    }
  }

  // Find roots: tasks with no dependencies
  const roots = tasks.filter((t) => t.dependencies.length === 0);

  const rendered = new Set<string>();
  const lines: string[] = [];

  function renderNode(id: string, prefix: string, isLast: boolean): void {
    const task = taskMap.get(id);
    if (!task) return;

    const connector = isLast ? '└─ ' : '├─ ';
    const extension = isLast ? '   ' : '│  ';

    if (rendered.has(id)) {
      lines.push(`${prefix}${connector}${id}  ${task.title} ${c_dim(`(↑ ${id})`)}`);
      return;
    }
    rendered.add(id);
    lines.push(`${prefix}${connector}${id}  ${task.title}`);

    const children = childrenOf.get(id) ?? [];
    for (let i = 0; i < children.length; i++) {
      renderNode(children[i], prefix + extension, i === children.length - 1);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    rendered.add(root.id);
    lines.push(`${root.id}  ${root.title}`);
    const children = childrenOf.get(root.id) ?? [];
    for (let j = 0; j < children.length; j++) {
      renderNode(children[j], '  ', j === children.length - 1);
    }
  }

  return lines.join('\n');
}

function c_dim(s: string): string {
  // Lightweight dim wrapper for ASCII graph (avoids color import cycle)
  return `\x1b[2m${s}\x1b[0m`;
}

/**
 * Render a Mermaid graph TD diagram for the given tasks.
 */
export function renderMermaidGraph(tasks: Task[]): string {
  const lines: string[] = ['graph TD'];
  for (const task of tasks) {
    const label = task.title.replace(/"/g, "'");
    lines.push(`  ${task.id}["${task.id}: ${label}"]`);
  }
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      lines.push(`  ${dep} --> ${task.id}`);
    }
  }
  return lines.join('\n');
}

/**
 * Detect cycles using DFS. Returns the cycle path or null.
 */
function detectCycle(tasks: Task[]): string[] | null {
  const adjList = new Map<string, string[]>();
  for (const task of tasks) {
    adjList.set(task.id, task.dependencies);
  }

  const WHITE = 0; // unvisited
  const GRAY = 1; // in current path
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const task of tasks) {
    color.set(task.id, WHITE);
  }

  for (const task of tasks) {
    if (color.get(task.id) === WHITE) {
      const cycle = dfs(task.id, adjList, color, parent);
      if (cycle) return cycle;
    }
  }

  return null;
}

function dfs(
  node: string,
  adjList: Map<string, string[]>,
  color: Map<string, number>,
  parent: Map<string, string>,
): string[] | null {
  const GRAY = 1;
  const BLACK = 2;

  color.set(node, GRAY);

  for (const dep of adjList.get(node) ?? []) {
    if (color.get(dep) === GRAY) {
      // Found cycle - reconstruct
      const cycle = [dep, node];
      let current = node;
      while (parent.has(current) && parent.get(current) !== dep) {
        current = parent.get(current)!;
        cycle.push(current);
      }
      return cycle.reverse();
    }

    if (color.get(dep) === undefined || color.get(dep) === 0) {
      parent.set(dep, node);
      const cycle = dfs(dep, adjList, color, parent);
      if (cycle) return cycle;
    }
  }

  color.set(node, BLACK);
  return null;
}
