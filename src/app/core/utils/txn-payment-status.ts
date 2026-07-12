/** Payment status for sales/purchases: 0 = on credit, 1 = paid in full, 2 = partially paid */
export function resolveTxnPaymentStatus(paid: number, balance: number, total: number): 0 | 1 | 2 {
  const p = Number(paid) || 0;
  const b = Number(balance) || 0;
  const t = Number(total) || 0;
  if (t <= 0 || b <= 0) return 1;
  if (p <= 0) return 0;
  return 2;
}

export function txnPaymentStatusLabel(status: number): string {
  if (status === 1) return 'Paid in full';
  if (status === 2) return 'Partially paid';
  return 'On credit';
}
