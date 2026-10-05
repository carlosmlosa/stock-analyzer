export const periods = [
  ['day', 'Last day'], ['week', 'Last week'], ['month', 'Last month'],
  ['ytd', 'YTD'], ['year', 'Last year'], ['2years', 'Last 2 years'],
  ['5years', 'Last 5 years'], ['10years', 'Last 10 years'], ['all', 'All'],
];
export function hasCalendarDates(dates) {
  return dates.length > 0 && dates.every((date, i) => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))?$/.test(date) &&
    Number.isFinite(Date.parse(date.length===10 ? date + 'T00:00:00Z' : date)) && (!i || date >= dates[i - 1]));
}
// Market-session approximations; YTD retains its calendar-year meaning.
export function periodBounds(dates, period, count = dates.length) {
  const last = Math.max(0, count - 1);
  const sessions = {day:1, week:5, month:21, year:252, '2years':504, '5years':1260, '10years':2520};
  if (sessions[period]) {
    if (dates.some(date => date.length > 10) && hasCalendarDates(dates)) {
      const days = [...new Set(dates.map(date => date.slice(0,10)))];
      const firstDay = days[Math.max(0, days.length - sessions[period])];
      return [dates.findIndex(date => date.slice(0,10) === firstDay), last];
    }
    return [Math.max(0, count - sessions[period]), last];
  }
  if (period === 'ytd' && hasCalendarDates(dates)) {
    const boundary = dates[last].slice(0, 4) + '-01-01';
    const first = dates.findIndex(date => date >= boundary);
    return [first < 0 ? last : first, last];
  }
  return [0, last];
}
