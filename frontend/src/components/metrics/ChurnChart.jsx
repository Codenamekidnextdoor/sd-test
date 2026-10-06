import { useMemo } from 'react';
import { Empty, Spin } from 'antd';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatBucket, formatNumber, pickField, pickNumber } from '../../utils/formatters.js';

const COLORS = {
  added: '#16a34a',
  removed: '#dc2626',
  churn: '#d97706'
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rat-tooltip">
      <div className="rat-tooltip__label">{formatBucket(label)}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value)}
        </div>
      ))}
    </div>
  );
}

/**
 * Churn over time — one line per bucket for added / removed / churn.
 * `data` rows: { bucket|date|label, added, removed, churn }
 */
export default function ChurnChart({ data, loading, error }) {
  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : data?.buckets ?? data?.series ?? [];
    return list.map((row) => {
      const added = pickNumber(row, ['added', 'addedLines', 'linesAdded']);
      const removed = pickNumber(row, ['removed', 'removedLines', 'linesRemoved']);
      return {
        label: pickField(row, ['bucket', 'date', 'label', 'period', 'timestamp'], ''),
        added,
        removed,
        churn: pickNumber(row, ['churn', 'totalChurn'], added + removed)
      };
    });
  }, [data]);

  if (loading) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error} />;
  }

  if (rows.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No timeline data for this selection" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#e8ecf3" vertical={false} />
        <XAxis
          dataKey="label"
          tickFormatter={formatBucket}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e8ecf3' }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatNumber(v)}
          width={56}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        <Line
          type="monotone"
          dataKey="added"
          name="Added"
          stroke={COLORS.added}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="removed"
          name="Removed"
          stroke={COLORS.removed}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="churn"
          name="Churn"
          stroke={COLORS.churn}
          strokeWidth={2.5}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
