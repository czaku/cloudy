import React, { useState } from 'react';
import type { Task } from '../types';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (tasks.length === 0) {
    return (
      <div className="left-panel">
        <div className="empty-state">
          <div className="empty-state-icon">☁</div>
          <div className="empty-state-text">Waiting for tasks...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="left-panel">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          expanded={expandedIds.has(task.id)}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}
