import { useMemo } from 'react';
import { Col, Empty, Row, Spin, Typography } from 'antd';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatNumber, pickField, pickNumber } from '../../utils/formatters.js';

const PALETTE = ['#0f766e', '#14b8a6', '#5eead4', '#d97706', '#f59e0b', '#64748b', '#94a3b8', '#334155'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rat-tooltip">
      <div className="rat-tooltip__label">{payload[0]?.name ?? label}</div>
      <div style={{ color: '#e6edf7' }}>
        {payload[0]?.dataKey === 'ownership' && `${payload[0].value}% of added lines`}
        {payload[0]?.dataKey === 'churn' && `${formatNumber(payload[0].value)} churned lines`}
        {payload[0]?.dataKey === 'commits' && `${formatNumber(payload[0].value)} commits`}
      </div>
    </div>
  );
}

/**
 * Author ownership pie (share of added lines) + author churn bar.
 * `data` authors: [{ name, added, removed, churn, commits }]
 */
export default function AuthorChart({ data, loading, error }) {
  const authors = useMemo(() => {
    const list = Array.isArray(data) ? data : data?.authors ?? [];
    return list.map((a) => {
      const added = pickNumber(a, ['added', 'addedLines', 'linesAdded']);
      const removed = pickNumber(a, ['removed', 'removedLines', 'linesRemoved']);
      return {
        // The backend sends `author_name` / `author_email`; the rest are
        // shape-tolerance fallbacks (email is the last-resort display name).
        name: pickField(a, ['author_name', 'name', 'canonicalName', 'author', 'author_email', 'email'], 'unknown'),
        added,
        removed,
        churn: pickNumber(a, ['churn', 'totalChurn'], added + removed),
        commits: pickNumber(a, ['commits', 'commitCount'])
      };
    });
  }, [data]);

  const ownership = useMemo(() => {
    const totalAdded = authors.reduce((sum, a) => sum + a.added, 0) || 1;
    const sorted = [...authors].sort((a, b) => b.added - a.added);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    const rows = top.map((a) => ({
      name: a.name,
      ownership: Math.round((a.added / totalAdded) * 1000) / 10
    }));
    if (rest.length > 0) {
      const restAdded = rest.reduce((sum, a) => sum + a.added, 0);
      rows.push({ name: `Others (${rest.length})`, ownership: Math.round((restAdded / totalAdded) * 1000) / 10 });
    }
    return rows;
  }, [authors]);

  const churnRows = useMemo(
    () => [...authors].sort((a, b) => b.churn - a.churn).slice(0, 10),
    [authors]
  );

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

  if (authors.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No author data for this selection" />
      </div>
    );
  }

  return (
    <Row gutter={[8, 8]}>
      <Col xs={24} lg={11}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Ownership — share of added lines
        </Typography.Text>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={ownership}
              dataKey="ownership"
              nameKey="name"
              innerRadius={48}
              outerRadius={86}
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {ownership.map((entry, index) => (
                <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => (String(value).length > 18 ? `${String(value).slice(0, 17)}…` : value)}
            />
          </PieChart>
        </ResponsiveContainer>
      </Col>
      <Col xs={24} lg={13}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Churn per author (top 10)
        </Typography.Text>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={churnRows} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v)}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 11, fill: '#334155' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (String(v).length > 14 ? `${String(v).slice(0, 13)}…` : v)}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,118,110,0.06)' }} />
            <Bar dataKey="churn" name="Churn" radius={[0, 4, 4, 0]}>
              {churnRows.map((entry, index) => (
                <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Col>
    </Row>
  );
}
