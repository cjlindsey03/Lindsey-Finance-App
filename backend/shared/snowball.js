// Debt payoff projection. Snowball orders by smallest balance first (the
// household's stated preference); avalanche orders by highest APR first.
const MAX_MONTHS = 360;

function projectPayoff(accounts, monthlyExtra, strategy = 'snowball') {
  const working = accounts
    .filter((a) => a.balance > 0)
    .map((a) => ({
      accountId: a.accountId,
      name: a.name,
      balance: a.balance,
      apr: a.apr ?? 0,
      minimumPayment: a.minimumPayment ?? Math.max(a.balance * 0.02, 25),
    }))
    .sort((a, b) => (strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance));

  const schedule = [];
  let rolledExtra = monthlyExtra;
  let totalInterest = 0;
  let month = 0;

  while (working.some((a) => a.balance > 0) && month < MAX_MONTHS) {
    month++;
    const targetIndex = working.findIndex((a) => a.balance > 0);

    for (let i = 0; i < working.length; i++) {
      const account = working[i];
      if (account.balance <= 0) continue;

      const payment = i === targetIndex ? account.minimumPayment + rolledExtra : account.minimumPayment;
      const interest = (account.balance * (account.apr / 100)) / 12;
      totalInterest += interest;
      account.balance = Math.max(0, account.balance + interest - payment);

      if (account.balance === 0) {
        // Freed-up minimum rolls into the next target — the snowball effect.
        rolledExtra += account.minimumPayment;
        schedule.push({ accountId: account.accountId, name: account.name, paidOffMonth: month });
      }
    }
  }

  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + month);

  return {
    strategy,
    schedule,
    totalMonths: month,
    totalInterest: Math.round(totalInterest * 100) / 100,
    projectedPayoffDate: payoffDate.toISOString().slice(0, 10),
  };
}

module.exports = { projectPayoff };
