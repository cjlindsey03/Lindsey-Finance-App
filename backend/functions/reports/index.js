const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { queryByPK } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { ok } = require('../../shared/http');

const REPORTS_TABLE = process.env.REPORTS_TABLE;
const REPORTS_BUCKET = process.env.REPORTS_BUCKET;

// The bucket is private, so each listing hands back a short-lived signed URL
// minted per request rather than a stored link that would go stale.
const URL_TTL_SECONDS = 900;

const s3 = new S3Client({});

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);

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
};
