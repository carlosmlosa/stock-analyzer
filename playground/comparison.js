export function addPoint(points, index) {
  return [...points, index].slice(-2);
}
export function comparePoints(values, dates, [a, b]) {
  const change = values[b] - values[a];
  const timestamp = date => Date.parse(date.length === 10 ? date + 'T00:00:00Z' : date.replace(' ', 'T'));
  const elapsed = timestamp(dates[b] || '') - timestamp(dates[a] || '');
  const total = timestamp(dates.at(-1) || '') - timestamp(dates[0] || '');
  return {change, percent: values[a] === 0 ? null : 100 * change / values[a],
    bars: b - a, elapsed: Number.isFinite(elapsed) ? elapsed : null,
    timePercent: Number.isFinite(elapsed) && total > 0 ? 100 * elapsed / total : null};
}
