const { randomUUID } = require('crypto');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { queryByPK, put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok, badRequest, parseBody } = require('../../shared/http');
const { getPeriod } = require('../../shared/payPeriod');
const { buildPeriodReport } = require('../../shared/periodReport');

const REPORTS_TABLE = process.env.REPORTS_TABLE;
const REPORTS_BUCKET = process.env.REPORTS_BUCKET;

// The bucket is private, so each listing hands back a short-lived signed URL
// minted per request rather than a stored link that would go stale.
const URL_TTL_SECONDS = 900;

const s3 = new S3Client({});

async function listReports(householdId) {
  const rows = await queryByPK(REPORTS_TABLE, householdId);
  rows.sort((a, b) => (b.SK ?? '').localeCompare(a.SK ?? ''));

  const reports = await Promise.all(
    rows.map(async ({ PK, SK, s3Key, ...rest }) => ({
      periodKey: SK,
      ...rest,
      url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: REPORTS_BUCKET, Key: s3Key }), {
        expiresIn: URL_TTL_SECONDS,
      }),
    }))
  );

  return ok({ reports, urlExpiresInSeconds: URL_TTL_SECONDS });
}

// Same work the scheduled job does, exposed on demand so a report can be
// pulled up for any period without waiting for a period to end. Regenerating
// an existing period overwrites it, which is what you want once the
// underlying numbers have moved.
async function generateReport(householdId, body) {
  const date = body?.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest('date must be YYYY-MM-DD');

  const period = getPeriod(date);
  const { data, pdf } = await buildPeriodReport(householdId, period);
  const s3Key = `${householdId}/${period.periodKey}.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket: REPORTS_BUCKET,
      Key: s3Key,
      Body: pdf,
      ContentType: 'application/pdf',
    })
  );

  const existing = (await queryByPK(REPORTS_TABLE, householdId)).find((r) => r.SK === period.periodKey);

  await put(REPORTS_TABLE, {
    PK: householdId,
    SK: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    s3Key,
    shareToken: existing?.shareToken ?? randomUUID(),
    generatedAt: new Date().toISOString(),
    totalIncome: data.totals.totalIncome,
    totalBills: data.totals.totalBills,
    netFlow: data.totals.netFlow,
    committedPlanLabel: data.committedPlan?.label ?? null,
    committedPlanScore: data.committedPlan?.score ?? null,
  });

  return ok({
    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    totals: data.totals,
    regenerated: Boolean(existing),
  });
}

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const method = event.requestContext?.http?.method || 'GET';

  if (method === 'POST') {
    const body = parseBody(event) ?? {};
    return generateReport(householdId, body);
  }

  return listReports(householdId);
};
