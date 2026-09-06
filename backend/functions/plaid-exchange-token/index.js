const { plaidClient } = require('../../shared/plaidClient');
const { put } = require('../../shared/db');
const { getHouseholdContext } = require('../../shared/auth');
const { syncHousehold } = require('../../shared/plaidSync');

const PLAID_ITEMS_TABLE = process.env.PLAID_ITEMS_TABLE;

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);
  const { publicToken, institutionId, institutionName } = JSON.parse(event.body || '{}');

  if (!publicToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'publicToken is required' }) };
  }

  const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  // Never return accessToken to the frontend or log it.
  await put(PLAID_ITEMS_TABLE, {
    PK: householdId,
    SK: itemId,
    accessToken,
    institutionId,
    institutionName,
    status: 'active',
    lastSync: null,
    cursor: undefined,
    error: null,
  });

  const summary = await syncHousehold(householdId);

  return {
    statusCode: 200,
    body: JSON.stringify({ itemId, institutionName, syncSummary: summary }),
  };
};
