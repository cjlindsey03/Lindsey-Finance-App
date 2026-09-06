// Reads the household's identity from the Cognito JWT that API Gateway's
// HTTP API authorizer already verified — never trust a householdId from the
// request body. In local dev (no real Cognito), falls back to a fixed
// household so `sam local start-api` works without standing up Cognito.
const LOCAL_HOUSEHOLD_ID = 'lindsey-001';

function getHouseholdContext(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;

  if (!claims) {
    if (process.env.AWS_SAM_LOCAL === 'true') {
      return { householdId: LOCAL_HOUSEHOLD_ID, userId: 'cj' };
    }
    throw new Error('Missing Cognito JWT claims — request did not pass through the authorizer');
  }

  const householdId = claims['custom:householdId'];
  const userId = claims['cognito:username'] || claims.username;

  if (!householdId) {
    throw new Error('JWT is missing the custom:householdId claim');
  }

  return { householdId, userId };
}

module.exports = { getHouseholdContext };
