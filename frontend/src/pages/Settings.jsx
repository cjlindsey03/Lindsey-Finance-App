import { useState } from 'react';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import {
  useAccounts,
  useUpdateAccount,
  useCreateAccount,
  useDeleteAccount,
  useG1,
  useG2,
  useG3,
} from '../api/hooks.js';
import { money, percent } from '../utils/format.js';
import { buildExportPrompt } from '../utils/exportPrompt.js';

const EMPTY_ACCOUNT = { name: '', type: 'credit', subtype: '', currentBalance: '', creditLimit: '', apr: '', minimumPayment: '' };

function AccountRow({ account, onDelete }) {
  const updateAccount = useUpdateAccount();
  const [draft, setDraft] = useState({
    currentBalance: account.currentBalance ?? '',
    apr: account.apr ?? '',
    minimumPayment: account.minimumPayment ?? '',
    statementCloseDay: account.statementCloseDay ?? '',
    dueDay: account.dueDay ?? '',
    isG1Target: account.isG1Target ?? false,
    g1Order: account.g1Order ?? '',
  });

  const num = (v) => (v === '' ? null : Number(v));

  const save = () =>
    updateAccount.mutate({
      accountId: account.accountId,
      currentBalance: Number(draft.currentBalance) || 0,
      apr: num(draft.apr),
      minimumPayment: num(draft.minimumPayment),
      statementCloseDay: num(draft.statementCloseDay),
      dueDay: num(draft.dueDay),
      isG1Target: draft.isG1Target,
      g1Order: num(draft.g1Order),
    });

  return (
    <tr>
      <td>
        {account.name}
        <div className="text-muted" style={{ fontSize: 11 }}>{account.type} · {account.subtype ?? '—'}</div>
      </td>
      <td><input className="input" style={{ width: 100 }} value={draft.currentBalance} onChange={(e) => setDraft({ ...draft, currentBalance: e.target.value })} /></td>
      <td>{account.utilization != null ? percent(account.utilization, 1) : '—'}</td>
      <td><input className="input" style={{ width: 70 }} value={draft.apr} onChange={(e) => setDraft({ ...draft, apr: e.target.value })} /></td>
      <td><input className="input" style={{ width: 80 }} value={draft.minimumPayment} onChange={(e) => setDraft({ ...draft, minimumPayment: e.target.value })} /></td>
      <td><input className="input" style={{ width: 60 }} value={draft.statementCloseDay} onChange={(e) => setDraft({ ...draft, statementCloseDay: e.target.value })} /></td>
      <td><input className="input" style={{ width: 60 }} value={draft.dueDay} onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })} /></td>
      <td>
        <input type="checkbox" checked={draft.isG1Target} onChange={(e) => setDraft({ ...draft, isG1Target: e.target.checked })} />
      </td>
      <td><input className="input" style={{ width: 55 }} value={draft.g1Order} onChange={(e) => setDraft({ ...draft, g1Order: e.target.value })} /></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button type="button" className="btn btn-ghost" onClick={save} disabled={updateAccount.isPending}>
          {updateAccount.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onDelete(account)}>Delete</button>
      </td>
    </tr>
  );
}

export default function Settings() {
  const { data: accountsData } = useAccounts();
  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const g1 = useG1();
  const g2 = useG2();
  const g3 = useG3();
  const [copied, setCopied] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_ACCOUNT);

  const copyExport = async () => {
    await navigator.clipboard.writeText(buildExportPrompt({ g1: g1.data, g2: g2.data, g3: g3.data }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitAccount = (e) => {
    e.preventDefault();
    const num = (v) => (v === '' ? null : Number(v));
    createAccount.mutate(
      {
        name: newAccount.name,
        type: newAccount.type,
        subtype: newAccount.subtype || null,
        currentBalance: Number(newAccount.currentBalance) || 0,
        creditLimit: num(newAccount.creditLimit),
        apr: num(newAccount.apr),
        minimumPayment: num(newAccount.minimumPayment),
      },
      { onSuccess: () => setNewAccount(EMPTY_ACCOUNT) }
    );
  };

  const confirmDelete = (account) => {
    if (window.confirm(`Delete ${account.name}? Its balance history is kept but the account disappears from G1/G3.`)) {
      deleteAccount.mutate(account.accountId);
    }
  };

  return (
    <>
      <PageHeader title="Settings" />

      <BlueprintCard>
        <div className="card-title">Accounts</div>
        <p className="card-body">
          Every account is maintained here by hand. Balances also move automatically when you commit a Spending Plan —
          that's the main way they stay current. Edit a balance directly for interest, a purchase, or a correction.
        </p>
        {!accountsData?.accounts?.length && <p className="card-body">No accounts yet — add your first below.</p>}
        {accountsData?.accounts?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>Util</th>
                  <th>APR</th>
                  <th>Min pmt</th>
                  <th>Close</th>
                  <th>Due</th>
                  <th>G1</th>
                  <th>Order</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accountsData.accounts.map((account) => (
                  <AccountRow key={account.accountId} account={account} onDelete={confirmDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Add Account</div>
        <form onSubmit={submitAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="acctName">Name</label>
            <input id="acctName" className="input" required value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} placeholder="e.g. Navy Fed Visa" />
          </div>
          <div className="field">
            <label htmlFor="acctType">Type</label>
            <select id="acctType" className="input" value={newAccount.type} onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}>
              <option value="credit">Credit card</option>
              <option value="loan">Loan</option>
              <option value="bnpl">BNPL</option>
              <option value="savings">Savings</option>
              <option value="checking">Checking</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="acctBalance">Balance</label>
            <input id="acctBalance" className="input" type="number" step="0.01" value={newAccount.currentBalance} onChange={(e) => setNewAccount({ ...newAccount, currentBalance: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="acctLimit">Credit limit</label>
            <input id="acctLimit" className="input" type="number" step="0.01" value={newAccount.creditLimit} onChange={(e) => setNewAccount({ ...newAccount, creditLimit: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="acctApr">APR %</label>
            <input id="acctApr" className="input" type="number" step="0.01" value={newAccount.apr} onChange={(e) => setNewAccount({ ...newAccount, apr: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="acctMin">Minimum payment</label>
            <input id="acctMin" className="input" type="number" step="0.01" value={newAccount.minimumPayment} onChange={(e) => setNewAccount({ ...newAccount, minimumPayment: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={createAccount.isPending}>
            {createAccount.isPending ? 'Adding…' : 'Add Account'}
          </button>
        </form>
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
