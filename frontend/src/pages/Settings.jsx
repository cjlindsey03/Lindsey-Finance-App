import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAccounts, useUpdateAccount, useSyncPlaid, usePlaidLinkToken, useG1, useG2, useG3 } from '../api/hooks.js';
import { money, percent } from '../utils/format.js';
import { buildExportPrompt } from '../utils/exportPrompt.js';

function AccountRow({ account }) {
  const updateAccount = useUpdateAccount();
  const [draft, setDraft] = useState({
    apr: account.apr ?? '',
    statementCloseDay: account.statementCloseDay ?? '',
    dueDay: account.dueDay ?? '',
    isG1Target: account.isG1Target ?? false,
    g1Order: account.g1Order ?? '',
  });

  const save = () =>
    updateAccount.mutate({
      accountId: account.accountId,
      apr: draft.apr === '' ? null : Number(draft.apr),
      statementCloseDay: draft.statementCloseDay === '' ? null : Number(draft.statementCloseDay),
      dueDay: draft.dueDay === '' ? null : Number(draft.dueDay),
      isG1Target: draft.isG1Target,
      g1Order: draft.g1Order === '' ? null : Number(draft.g1Order),
    });

  return (
    <tr>
      <td>
        {account.name}
        <div className="text-muted" style={{ fontSize: 11 }}>{account.type} · {account.subtype ?? '—'}</div>
      </td>
      <td>{money(account.currentBalance, { maximumFractionDigits: 2 })}</td>
      <td>{account.utilization != null ? percent(account.utilization, 1) : '—'}</td>
      <td><input className="input" style={{ width: 70 }} value={draft.apr} onChange={(e) => setDraft({ ...draft, apr: e.target.value })} /></td>
      <td><input className="input" style={{ width: 60 }} value={draft.statementCloseDay} onChange={(e) => setDraft({ ...draft, statementCloseDay: e.target.value })} /></td>
      <td><input className="input" style={{ width: 60 }} value={draft.dueDay} onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })} /></td>
      <td>
        <input type="checkbox" checked={draft.isG1Target} onChange={(e) => setDraft({ ...draft, isG1Target: e.target.checked })} />
      </td>
      <td><input className="input" style={{ width: 55 }} value={draft.g1Order} onChange={(e) => setDraft({ ...draft, g1Order: e.target.value })} /></td>
      <td>
        <button type="button" className="btn btn-ghost" onClick={save} disabled={updateAccount.isPending}>
          {updateAccount.isPending ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}

export default function Settings() {
  const { data: accountsData } = useAccounts();
  const syncPlaid = useSyncPlaid();
  const linkToken = usePlaidLinkToken();
  const g1 = useG1();
  const g2 = useG2();
  const g3 = useG3();
  const [copied, setCopied] = useState(false);

  const copyExport = async () => {
    await navigator.clipboard.writeText(buildExportPrompt({ g1: g1.data, g2: g2.data, g3: g3.data }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <PageHeader title="Settings" />

      <BlueprintCard>
        <div className="card-title">Bank Connections</div>
        <p className="card-body">
          Connect Navy Federal (and any other institution) through Plaid. Balances and transactions then sync
          automatically each morning.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => linkToken.mutate()} disabled={linkToken.isPending}>
            {linkToken.isPending ? 'Preparing…' : 'Connect an Institution'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => syncPlaid.mutate()} disabled={syncPlaid.isPending}>
            {syncPlaid.isPending ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
        {linkToken.data?.linkToken && (
          <p className="text-muted" style={{ fontSize: 12 }}>
            Link token ready. Plaid Link opens here once the Plaid Link SDK is wired in — for now this confirms the
            backend can reach Plaid.
          </p>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Account Configuration</div>
        <p className="card-body">
          APR, statement close day, and due day aren't supplied by Plaid — set them here so payment predictions and the
          snowball projection are accurate.
        </p>
        {!accountsData?.accounts?.length && <p className="card-body">No accounts yet — connect an institution above.</p>}
        {accountsData?.accounts?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>Util</th>
                  <th>APR</th>
                  <th>Close</th>
                  <th>Due</th>
                  <th>G1</th>
                  <th>Order</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accountsData.accounts.map((account) => (
                  <AccountRow key={account.accountId} account={account} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Export for Claude</div>
        <p className="card-body">
          Copies a full household snapshot to your clipboard, formatted to paste into a Claude chat for advice.
        </p>
        <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={copyExport}>
          {copied ? 'Copied' : 'Copy Snapshot'}
        </button>
      </BlueprintCard>
    </>
  );
}
