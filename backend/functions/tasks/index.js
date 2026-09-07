const { randomUUID } = require('crypto');
const { queryByPK, get, put, del } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, notFound, noContent, parseBody } = require('../../shared/http');
const SEED_TASKS = require('../../seed/tasks.json');

const TASKS_TABLE = process.env.TASKS_TABLE;

// The standard USMC checklist is seeded on first read so a new household
// doesn't start with an empty page.
async function loadOrSeed(householdId) {
  const existing = await queryByPK(TASKS_TABLE, householdId);
  if (existing.length) return existing;

  const seeded = SEED_TASKS.map((task) => ({
    PK: householdId,
    SK: randomUUID(),
    ...task,
    isComplete: false,
    completedBy: null,
    completedAt: null,
    notes: '',
    isUserAdded: false,
  }));

  await Promise.all(seeded.map((task) => put(TASKS_TABLE, task)));
  return seeded;
}

exports.handler = async (event) => {
  const { householdId, userId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';
  const taskId = event.pathParameters?.taskId;

  if (method === 'GET') {
    const tasks = await loadOrSeed(householdId);
    tasks.sort((a, b) => (b.daysBeforePCS ?? 0) - (a.daysBeforePCS ?? 0));

    const grouped = {};
    for (const { PK, SK, ...rest } of tasks) {
      (grouped[rest.category] ??= []).push({ taskId: SK, ...rest });
    }

    return ok({ tasks: tasks.map(({ PK, SK, ...rest }) => ({ taskId: SK, ...rest })), grouped });
  }

  if (method === 'DELETE') {
    if (!taskId) return badRequest('taskId is required');
    const existing = await get(TASKS_TABLE, { PK: householdId, SK: taskId });
    if (!existing) return notFound('Task not found');
    // Seeded checklist items used to be undeletable, but it's their checklist —
    // a task that doesn't apply to this move is just clutter.

    await del(TASKS_TABLE, { PK: householdId, SK: taskId });
    return noContent();
  }

  const body = parseBody(event);
  if (!body) return badRequest('Invalid JSON body');

  if (method === 'POST') {
    const task = {
      PK: householdId,
      SK: randomUUID(),
      title: body.title,
      category: body.category ?? 'Admin',
      daysBeforePCS: body.daysBeforePCS ?? 0,
      isComplete: false,
      completedBy: null,
      completedAt: null,
      notes: body.notes ?? '',
      isUserAdded: true,
    };
    if (!task.title) return badRequest('title is required');

    await put(TASKS_TABLE, task);
    const { PK, SK, ...rest } = task;
    return ok({ task: { taskId: SK, ...rest } });
  }

  if (method === 'PUT') {
    if (!taskId) return badRequest('taskId is required');
    const existing = await get(TASKS_TABLE, { PK: householdId, SK: taskId });
    if (!existing) return notFound('Task not found');

    const becomingComplete = body.isComplete === true && !existing.isComplete;
    const updated = {
      ...existing,
      ...body,
      PK: householdId,
      SK: taskId,
      completedBy: becomingComplete ? userId : body.isComplete === false ? null : existing.completedBy,
      completedAt: becomingComplete
        ? new Date().toISOString()
        : body.isComplete === false
        ? null
        : existing.completedAt,
    };
    await put(TASKS_TABLE, updated);

    const { PK, SK, ...rest } = updated;
    return ok({ task: { taskId: SK, ...rest } });
  }

  return badRequest(`Unsupported method ${method}`);
};
