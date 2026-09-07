import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useTasks, useSaveTask, useDeleteTask, useG2 } from '../api/hooks.js';
import { daysUntil, dueDateFromPcs, urgency } from '../utils/dates.js';
import { shortDate } from '../utils/format.js';

const EMPTY_TASK = { title: '', category: 'Admin', daysBeforePCS: 30 };
const CATEGORIES = ['Admin', 'Housing', 'Finance', 'Logistics', 'Vehicles'];

export default function Tasks() {
  const { data, isLoading } = useTasks();
  // Tasks only store an offset from the move, so the PCS date is what turns
  // "30 days before" into an actual deadline.
  const { data: g2 } = useG2();
  const saveTask = useSaveTask();
  const deleteTask = useDeleteTask();
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
          {tasks.map((task) => {
            const dueDate = dueDateFromPcs(g2?.pcsDate, task.daysBeforePCS);
            // A finished task has no deadline left to worry about.
            const countdown = task.isComplete ? { label: null } : urgency(daysUntil(dueDate));

            return (
              <div
                key={task.taskId}
                style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', fontSize: 13 }}
              >
                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', flex: 1, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={task.isComplete}
                    onChange={(e) => saveTask.mutate({ taskId: task.taskId, isComplete: e.target.checked })}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ flex: 1, opacity: task.isComplete ? 0.55 : 1, textDecoration: task.isComplete ? 'line-through' : 'none' }}>
                    {task.title}
                    <span className="text-muted" style={{ marginLeft: 8, fontSize: 11 }}>
                      {dueDate
                        ? `due ${shortDate(dueDate)}`
                        : task.daysBeforePCS >= 0
                          ? `${task.daysBeforePCS}d before`
                          : `${Math.abs(task.daysBeforePCS)}d after`}
                      {task.completedBy ? ` · done by ${task.completedBy}` : ''}
                    </span>
                  </span>
                </label>

                {countdown.label && (
                  <span className={countdown.tone === 'danger' ? 'tag tag-danger' : 'tag tag-outline'} style={{ whiteSpace: 'nowrap' }}>
                    {countdown.label}
                  </span>
                )}

                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Delete ${task.title}`}
                  onClick={() => deleteTask.mutate(task.taskId)}
                  disabled={deleteTask.isPending}
                >
                  Delete
                </button>
              </div>
            );
          })}
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
