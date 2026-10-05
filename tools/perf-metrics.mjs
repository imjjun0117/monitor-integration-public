export function percentile(samples, value) {
  if (!samples.length) throw new Error('at least one sample is required');
  if (value <= 0 || value > 100) throw new Error('percentile must be in (0, 100]');
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil((value / 100) * sorted.length) - 1];
}

export function queueSettlesWithoutGrowth(samples) {
  if (!samples.length || samples.at(-1) !== 0) return false;
  const peak = samples.indexOf(Math.max(...samples));
  return samples.slice(peak).every((value, index, draining) =>
    index === 0 || value <= draining[index - 1]);
}
