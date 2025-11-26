type LateFeeResult = {
  monthsLate: number;
  lateAmount: number;
  totalWithLate: number;
};

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

export function roundTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
