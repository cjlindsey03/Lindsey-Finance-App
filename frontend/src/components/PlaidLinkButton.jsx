import { usePlaidLink } from 'react-plaid-link';

// Thin wrapper around Plaid's Link SDK — react-plaid-link needs the token to
// exist before it can build the `open` handler, so the parent fetches the
// link token and only mounts this once one is available.
export default function PlaidLinkButton({ linkToken, onSuccess, disabled, children }) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => onSuccess(publicToken, metadata),
  });

  return (
    <button type="button" className="btn btn-primary" disabled={!ready || disabled} onClick={() => open()}>
      {children}
    </button>
  );
}
