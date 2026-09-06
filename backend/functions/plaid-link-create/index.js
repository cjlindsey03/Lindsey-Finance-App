const { plaidClient } = require('../../shared/plaidClient');
const { getHouseholdContext } = require('../../shared/auth');

exports.handler = async (event) => {
  const { householdId } = getHouseholdContext(event);

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: householdId },
    client_name: 'Lindsey Household Finance',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ linkToken: response.data.link_token }),
  };
};
