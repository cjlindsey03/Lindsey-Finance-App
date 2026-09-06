const { queryByPK, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, parseBody } = require('../../shared/http');

const G3_TABLE = process.env.G3_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;

const SCORE_TIERS = [600, 620, 640, 660, 680, 700];

async function aggregateUtilization(householdId) {
  const accounts = await queryByPK(ACCOUNTS_TABLE, householdId);
  const revolving = accounts.filter((a) => a.creditLimit > 0);

  const totalBalance = revolving.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);
  const totalLimit = revolving.reduce((sum, a) => sum + a.creditLimit, 0);

  return {
    aggregateUtil: totalLimit ? Math.round((totalBalance / totalLimit) * 1000) / 10 : null,
    totalBalance,
    totalLimit,
    perCard: revolving.map((a) => ({
      accountId: a.SK,
      name: a.name,
      balance: a.currentBalance ?? 0,
      creditLimit: a.creditLimit,
      utilization: Math.round(((a.currentBalance ?? 0) / a.creditLimit) * 1000) / 10,
    })),
  };
}

function nextTier(score) {
  const target = SCORE_TIERS.find((t) => t > score);
  return target ? { nextTier: target, pointsAway: target - score } : { nextTier: null, pointsAway: 0 };
}

// Balance needed to bring aggregate utilization down to a target percentage.
function balanceForTarget(totalLimit, totalBalance, targetPct) {
  const allowed = totalLimit * (targetPct / 100);
  return Math.max(0, Math.round((totalBalance - allowed) * 100) / 100);
}

async function getG3(householdId) {
  const records = await queryByPK(G3_TABLE, householdId);
  records.sort((a, b) => a.SK.localeCompare(b.SK));

  const utilization = await aggregateUtilization(householdId);

  const byUser = {};
  for (const record of records) {
    const { PK, SK, ...rest } = record;
    (byUser[record.userId] ??= []).push(rest);
  }

  const latestByUser = Object.fromEntries(
    Object.entries(byUser).map(([userId, entries]) => {
      const latest = entries[entries.length - 1];
      const best = Math.max(latest.equifaxScore ?? 0, latest.transunionScore ?? 0, latest.experianScore ?? 0);
      return [userId, { ...latest, bestScore: best, ...nextTier(best) }];
    })
  );

  return ok({
    history: byUser,
    latest: latestByUser,
    utilization,
    utilizationTargets: {
      to30Pct: balanceForTarget(utilization.totalLimit, utilization.totalBalance, 30),
      to20Pct: balanceForTarget(utilization.totalLimit, utilization.totalBalance, 20),
    },
  });
}

async function addScore(householdId, body) {
  if (!body?.userId || !body?.recordDate) return badRequest('userId and recordDate are required');

  const utilization = await aggregateUtilization(householdId);

  await put(G3_TABLE, {
    PK: householdId,
    SK: `${body.recordDate}#${body.userId}`,
    userId: body.userId,
    recordDate: body.recordDate,
    equifaxScore: body.equifaxScore ?? null,
    transunionScore: body.transunionScore ?? null,
    experianScore: body.experianScore ?? null,
    equifaxUtil: utilization.aggregateUtil,
    transunionUtil: body.transunionUtil ?? null,
    experianUtil: body.experianUtil ?? null,
    notes: body.notes ?? '',
  });

  return getG3(householdId);
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'POST') {
    const body = parseBody(event);
    if (!body) return badRequest('Invalid JSON body');
    return addScore(householdId, body);
  }

  return getG3(householdId);
};
