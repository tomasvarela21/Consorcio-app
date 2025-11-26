const currencyFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatCurrency = (value: number): string => {
  const numeric = Number.isFinite(value) ? value : 0;
  return `$${currencyFormatter.format(numeric)}`;
};

export const formatCurrencyOrDash = (value: number): string => {
  return Math.abs(value) < 0.0005 ? "-" : formatCurrency(value);
};
