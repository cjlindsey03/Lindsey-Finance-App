const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

// PLAID_CLIENT_ID / PLAID_SECRET arrive as Lambda environment variables,
// encrypted at rest by the AWS-managed KMS key Lambda applies by default.
// Locally these come from a gitignored .env loaded by the dev harness.
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

module.exports = { plaidClient };
