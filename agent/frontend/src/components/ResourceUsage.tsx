// 사용량·전체 용량·사용률 표시
import { byteUnitFor, formatBytes, formatPercent } from '../utils/format';

export default function ResourceUsage({
  used,
  total,
  capacityLabel = '전체',
  unit = 'bytes',
  label,
  valueLabel,
}: {
  used?: number | null;
  total?: number | null;
  capacityLabel?: string;
  unit?: 'bytes' | 'ratio';
  label?: string;
  valueLabel?: string;
}) {
  const usage = typeof used === 'number' && Number.isFinite(used) && used >= 0 ? used : null;
  const capacity = typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : null;
  const ratio = usage != null && capacity != null ? usage / capacity : null;
  const byteUnit = byteUnitFor(capacity ?? usage ?? 0);
  return (
    <div className="resource-usage">
      {label && <span className="resource-usage-label">{label}</span>}
      <div className="resource-usage-heading">
        <div className="resource-usage-value" aria-label={valueLabel}>
          <strong>{unit === 'ratio' ? formatPercent(usage) : formatBytes(usage, byteUnit)}</strong>
          {unit === 'bytes' && <span> / {formatBytes(capacity, byteUnit)}</span>}
        </div>
        {unit === 'bytes' && <span className="resource-usage-percent">{formatPercent(ratio)}</span>}
      </div>
      {ratio != null ? (
        <meter
          className="resource-usage-meter"
          min={0}
          max={1}
          value={Math.min(1, ratio)}
          aria-label={`${label ?? capacityLabel} 사용률`}
          aria-valuetext={formatPercent(ratio)}
        />
      ) : (
        <div className="resource-usage-meter unavailable" aria-hidden="true" />
      )}
      <p className="resource-usage-note">
        {unit === 'ratio' ? (
          '전체 CPU 기준 사용률'
        ) : (
          <>
            {capacityLabel} {formatBytes(capacity, byteUnit)}
            {usage != null && capacity != null && (
              <> · 여유 {formatBytes(Math.max(0, capacity - usage), byteUnit)}</>
            )}
          </>
        )}
      </p>
    </div>
  );
}
