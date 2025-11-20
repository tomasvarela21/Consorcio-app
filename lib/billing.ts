type LateFeeResult = {
  monthsLate: number;
  lateAmount: number;
  totalWithLate: number;
};

export function calculateLateFee(
  originalAmount: number,
  dueDate2: Date,
  today = new Date(),
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

  const lateAmount = roundTwo(originalAmount * 0.1 * monthsLate);
  const totalWithLate = roundTwo(originalAmount + lateAmount);
  return { monthsLate, lateAmount, totalWithLate };
}

export function roundTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
