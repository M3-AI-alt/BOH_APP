// Approved receiving destinations, not suggestions inferred from historic cash.
// Keep these in sync with the database receiving-account guard and worksheets.
export const COMPANY_RECEIVING_ACCOUNTS = ['Company BIDV', 'Company VCB'];
export const COMPANY_ACCOUNT_HELP =
  'Company accounts only. Managed by Karam Mouelhi, Founder and Director.';
export const COMPANY_ACCOUNT_ERROR =
  'Choose Company BIDV or Company VCB. Personal accounts cannot receive new payments.';
export const LEGACY_ACCOUNT_HELP =
  'Historical account — kept for the original record only. New payments must use a company account.';
export const LEGACY_ACCOUNT_ERROR =
  'This historical receiving account is read-only. Keep its original amount and date; record new money in a company account.';

export function isCompanyReceivingAccount(account: unknown): boolean {
  return (
    typeof account === 'string' && COMPANY_RECEIVING_ACCOUNTS.includes(account)
  );
}

export function receiptAccountError(
  data: Record<string, unknown>,
  previous?: Record<string, unknown>,
): string | undefined {
  if (isCompanyReceivingAccount(data.account)) return;
  if (!previous || data.account !== previous.account)
    return COMPANY_ACCOUNT_ERROR;
  if (data.amount !== previous.amount || data.date !== previous.date)
    return LEGACY_ACCOUNT_ERROR;
}

export function receivingAccountChoices(previous?: Record<string, unknown>): {
  id: string;
  label: string;
  disabledReason?: string;
}[] {
  return [
    ...COMPANY_RECEIVING_ACCOUNTS.map((id) => ({ id, label: id })),
    ...(typeof previous?.account === 'string' &&
    previous.account &&
    !isCompanyReceivingAccount(previous.account)
      ? [
          {
            id: previous.account,
            label: previous.account,
            disabledReason: LEGACY_ACCOUNT_HELP,
          },
        ]
      : []),
  ];
}
