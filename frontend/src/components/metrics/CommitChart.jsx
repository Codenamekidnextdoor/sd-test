import { useMemo } from 'react';
import { Empty, Spin } from 'antd';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatBucket, formatNumber, pickField, pickNumber } from '../../utils/formatters.js';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rat-tooltip">
      <div className="rat-tooltip__label">{formatBucket(label)}</div>
      <div style={{ color: '#5eead4' }}>{formatNumber(payload[0].value)} commits</div>
    </div>
  );
}

/**
 * Commit activity over time — commit count per time bucket.
 * `data` rows: { bucket|date|label, commits|count }
 */
export default function CommitChart({ data, loading, error }) {
  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : data?.buckets ?? data?.series ?? [];
    return list.map((row) => ({
      label: pickField(row, ['bucket', 'date', 'label', 'period', 'timestamp'], ''),
      commits: pickNumber(row, ['commits', 'count', 'commitCount'])
    }));
  }, [data]);

  if (loading) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error} />;
  }

  if (rows.length === 0) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No commit activity for this selection" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,118,110,0.06)' }} />
        <Bar dataKey="commits" name="Commits" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
