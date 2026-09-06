import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useTasks, useSaveTask } from '../api/hooks.js';

const EMPTY_TASK = { title: '', category: 'Admin', daysBeforePCS: 30 };
const CATEGORIES = ['Admin', 'Housing', 'Finance', 'Logistics', 'Vehicles'];

export default function Tasks() {
  const { data, isLoading } = useTasks();
  const saveTask = useSaveTask();
  const [newTask, setNewTask] = useState(EMPTY_TASK);

  const submit = (e) => {
    e.preventDefault();
    saveTask.mutate(
      { ...newTask, daysBeforePCS: Number(newTask.daysBeforePCS) },
      { onSuccess: () => setNewTask(EMPTY_TASK) }
    );
  };

  const completedCount = (data?.tasks ?? []).filter((t) => t.isComplete).length;

  return (
    <>
      <PageHeader title="Tasks" />

      <BlueprintCard style={{ gap: 'var(--space-2)' }}>
        <div className="card-kicker">PCS Checklist Progress</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 28 }}>
          {completedCount} / {data?.tasks?.length ?? 0}
        </div>
      </BlueprintCard>

      {isLoading && <BlueprintCard><p className="card-body">Loading…</p></BlueprintCard>}

      {Object.entries(data?.grouped ?? {}).map(([category, tasks]) => (
        <BlueprintCard key={category}>
          <div className="card-title">{category}</div>
          {tasks.map((task) => (
            <label
              key={task.taskId}
              style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={task.isComplete}
                onChange={(e) => saveTask.mutate({ taskId: task.taskId, isComplete: e.target.checked })}
                style={{ marginTop: 3 }}
              />
              <span style={{ flex: 1, opacity: task.isComplete ? 0.55 : 1, textDecoration: task.isComplete ? 'line-through' : 'none' }}>
                {task.title}
                <span className="text-muted" style={{ marginLeft: 8, fontSize: 11 }}>
                  {task.daysBeforePCS >= 0 ? `${task.daysBeforePCS}d before` : `${Math.abs(task.daysBeforePCS)}d after`}
                  {task.completedBy ? ` · done by ${task.completedBy}` : ''}
                </span>
              </span>
            </label>
          ))}
        </BlueprintCard>
      ))}

      <BlueprintCard>
        <div className="card-title">Add Task</div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="title">Title</label>
            <input id="title" className="input" required value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" className="input" value={newTask.category} onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="daysBeforePCS">Days before PCS</label>
            <input id="daysBeforePCS" className="input" type="number" value={newTask.daysBeforePCS} onChange={(e) => setNewTask({ ...newTask, daysBeforePCS: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saveTask.isPending}>Add Task</button>
        </form>
      </BlueprintCard>
    </>
  );
}
