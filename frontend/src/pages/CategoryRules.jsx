import { useState } from 'react';
import { Link } from 'react-router-dom';
import BlueprintCard from '../components/BlueprintCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useCategoryRules, useSaveCategoryRule, useDeleteCategoryRule, useTestCategoryRule } from '../api/hooks.js';
import { CATEGORIES } from '../constants/categories.js';
import { money, shortDate } from '../utils/format.js';

const EMPTY_RULE = {
  matchOn: 'merchantName',
  matchType: 'contains',
  matchValue: '',
  assignCategory: 'Other',
  isActive: true,
};

export default function CategoryRules() {
  const { data } = useCategoryRules();
  const saveRule = useSaveCategoryRule();
  const deleteRule = useDeleteCategoryRule();
  const testRule = useTestCategoryRule();
  const [rule, setRule] = useState(EMPTY_RULE);

  const update = (key) => (e) => setRule({ ...rule, [key]: e.target.value });

  return (
    <>
      <PageHeader
        title="Categorization Rules"
        actions={<Link className="btn btn-secondary" to="/transactions">Back to Transactions</Link>}
      />

      <BlueprintCard>
        <div className="card-title">New Rule</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
          <div className="field">
            <label htmlFor="matchOn">Match on</label>
            <select id="matchOn" className="input" value={rule.matchOn} onChange={update('matchOn')}>
              <option value="merchantName">Merchant name</option>
              <option value="description">Description</option>
              <option value="amount">Amount</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="matchType">Match type</label>
            <select id="matchType" className="input" value={rule.matchType} onChange={update('matchType')}>
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
              <option value="startsWith">Starts with</option>
              <option value="endsWith">Ends with</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="matchValue">Value</label>
            <input id="matchValue" className="input" value={rule.matchValue} onChange={update('matchValue')} placeholder="e.g. T-MOBILE" />
          </div>
          <div className="field">
            <label htmlFor="assignCategory">Assign category</label>
            <select id="assignCategory" className="input" value={rule.assignCategory} onChange={update('assignCategory')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => testRule.mutate(rule)} disabled={testRule.isPending}>
            {testRule.isPending ? 'Testing…' : 'Test Rule'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saveRule.isPending || !rule.matchValue}
            onClick={() => saveRule.mutate(rule, { onSuccess: () => setRule(EMPTY_RULE) })}
          >
            {saveRule.isPending ? 'Saving…' : 'Save Rule'}
          </button>
        </div>

        {testRule.data && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div className="card-kicker">{testRule.data.matchCount} matches in the last 30 days</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <tbody>
                  {testRule.data.matches.slice(0, 10).map((tx) => (
                    <tr key={tx.transactionId}>
                      <td>{shortDate(tx.date)}</td>
                      <td>{tx.merchantName}</td>
                      <td>{money(tx.amount, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </BlueprintCard>

      <BlueprintCard>
        <div className="card-title">Active Rules</div>
        {!data?.rules?.length && <p className="card-body">No rules yet — Plaid's own categories are used as the fallback.</p>}
        {data?.rules?.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Match</th>
                  <th>Category</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r) => (
                  <tr key={r.ruleId}>
                    <td>{r.priority}</td>
                    <td>{r.matchOn} {r.matchType} “{r.matchValue}”</td>
                    <td><span className="tag tag-outline">{r.assignCategory}</span></td>
                    <td>
                      <button type="button" className="btn btn-ghost" onClick={() => deleteRule.mutate(r.ruleId)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlueprintCard>
    </>
  );
}
