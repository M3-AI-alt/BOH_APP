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
export const PAYING_ACCOUNT_HELP =
  'The company account money leaves. Enter the person receiving it separately below.';
export const PAYING_ACCOUNT_ERROR =
  'Choose Company BIDV or Company VCB as the paying account. Enter personal bank details under Recipient details.';
export const LEGACY_PAYING_ACCOUNT_HELP =
  'Historical paying account — preserved for this record only. New expenses use a company account.';
export const LEGACY_PAYING_ACCOUNT_ERROR =
  'Keep the original amount and date for this historical paying account. Record new expenses from a company account.';

export function expenseAccountError(
  data: Record<string, unknown>,
  previous?: Record<string, unknown>,
): string | undefined {
  const error = receiptAccountError(data, previous);
  if (error === COMPANY_ACCOUNT_ERROR) return PAYING_ACCOUNT_ERROR;
  if (error) return LEGACY_PAYING_ACCOUNT_ERROR;
}

export function payingAccountChoices(previous?: Record<string, unknown>) {
  return receivingAccountChoices(previous).map((option) => ({
    ...option,
    disabledReason: option.disabledReason
      ? LEGACY_PAYING_ACCOUNT_HELP
      : undefined,
  }));
}
export function recipientErrors(data: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const key of ['name', 'recipientBank', 'recipientAccount']) {
    const value = data[key];
    if (value == null || value === '') continue;
    if (
      typeof value !== 'string' ||
      value.length > (key === 'name' ? 160 : 100) ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
      errors[key] =
        key === 'recipientAccount'
          ? 'Enter the account number as text, including any leading zeros (up to 100 characters).'
          : 'Enter a valid recipient detail within the permitted length.';
  }
  if (
    (data.recipientBank || data.recipientAccount) &&
    !String(data.name || '').trim()
  )
    errors.name = 'Enter the recipient or account holder name.';
  return errors;
}

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
