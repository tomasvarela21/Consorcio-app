type LateFeeResult = {
  monthsLate: number;
  lateAmount: number;
  totalWithLate: number;
};

export const EARLY_PAYMENT_DISCOUNT_RATE = 0.1;

export function calculateLateFee(
  originalAmount: number,
  dueDate2: Date,
  today = new Date(),
  lateFeePercentage = 10,
): LateFeeResult {
  if (!dueDate2) {
    return { monthsLate: 0, lateAmount: 0, totalWithLate: originalAmount };
  }
  const start = new Date(
    Date.UTC(dueDate2.getFullYear(), dueDate2.getMonth(), 1),
  );
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
  const monthsLate =
    Math.max(
      0,
      (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth()),
    ) || 0;

  const rate = Math.max(0, Number(lateFeePercentage)) / 100;
  const lateAmount = roundTwo(originalAmount * rate * monthsLate);
  const totalWithLate = roundTwo(originalAmount + lateAmount);
  return { monthsLate, lateAmount, totalWithLate };
}

export function getEarlyPaymentDiscountCap(amount: number) {
  return roundTwo(Math.max(0, amount) * EARLY_PAYMENT_DISCOUNT_RATE);
}

export function getChargePortions({
  previousBalance,
  currentFee,
  partialPaymentsTotal,
  discountApplied = 0,
}: {
  previousBalance: number;
  currentFee: number;
  partialPaymentsTotal: number;
  discountApplied?: number;
}) {
  const prev = Math.max(0, Number(previousBalance ?? 0));
  const current = Math.max(0, Number(currentFee ?? 0));
  const paid = Math.max(0, Number(partialPaymentsTotal ?? 0));
  const discount = Math.max(0, Number(discountApplied ?? 0));

  const previousOutstanding = Math.max(0, roundTwo(prev - paid));
  const currentPaid = Math.max(0, roundTwo(paid - prev));
  const currentOutstandingNominal = Math.max(
    0,
    roundTwo(current - currentPaid - discount),
  );

  return { previousOutstanding, currentPaid, currentOutstandingNominal };
}

export function getDiscountStats(currentFee: number, discountUsed: number) {
  const cap = getEarlyPaymentDiscountCap(currentFee);
  const used = Math.min(cap, Math.max(0, roundTwo(discountUsed ?? 0)));
  const remaining = Math.max(0, roundTwo(cap - used));
  return { cap, used, remaining };
}

export function calculateEarlyPaymentDiscount({
  amountForCurrent,
  paymentDate,
  firstDueDate,
  currentOutstandingNominal,
  discountRemaining,
}: {
  amountForCurrent: number;
  paymentDate: Date;
  firstDueDate: Date | null;
  currentOutstandingNominal: number;
  discountRemaining: number;
}) {
  if (
    !firstDueDate ||
    paymentDate > firstDueDate ||
    amountForCurrent <= 0 ||
    currentOutstandingNominal <= 0 ||
    discountRemaining <= 0
  ) {
    return 0;
  }

  return Math.min(discountRemaining, currentOutstandingNominal);
}

export function roundTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
