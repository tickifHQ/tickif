const BUDGET_RANGE_PATTERN =
  /^₹?\s*(\d+(?:\.\d+)?)\s*L?\s*[-\u2013\u2014]\s*₹?\s*(\d+(?:\.\d+)?)\s*L?$/i;

/** Condenses a budget range to one currency prefix and one unit suffix. */
export function formatCompactBudgetLabel(label: string): string {
  const range = BUDGET_RANGE_PATTERN.exec(label.trim());
  return range ? `₹${range[1]}–${range[2]}L` : label;
}
