const { getHouseholdContext } = require('../../shared/auth');
const { syncHousehold } = require('../../shared/plaidSync');

// Single-household app — the scheduled EventBridge trigger has no JWT to
// read a householdId from, so it always syncs the one household.
const HOUSEHOLD_ID = 'lindsey-001';

exports.handler = async (event) => {
  const isScheduledRun = event.source === 'aws.events';
  const householdId = isScheduledRun ? HOUSEHOLD_ID : getHouseholdContext(event).householdId;

  const summary = await syncHousehold(householdId);

  if (isScheduledRun) {
    return summary;
  }

  return { statusCode: 200, body: JSON.stringify({ syncSummary: summary }) };
};
