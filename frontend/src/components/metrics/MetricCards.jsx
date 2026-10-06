import { Card, Col, Row, Skeleton, Statistic, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { formatNumber, formatSigned, pickNumber } from '../../utils/formatters.js';

/**
 * Four summary statistic cards: Total Added, Total Removed, Growth, Churn.
 * `data` may be the repo metrics object or a row from any metrics list.
 */
export default function MetricCards({ data, loading }) {
  const added = pickNumber(data, ['added', 'addedLines', 'linesAdded', 'totalAdded', 'l+', 'plus']);
  const removed = pickNumber(data, ['removed', 'removedLines', 'linesRemoved', 'totalRemoved', 'l-', 'minus']);
  const growth = pickNumber(data, ['growth', 'net', 'netGrowth', 'delta', 'totalGrowth'], added - removed);
  const churn = pickNumber(data, ['churn', 'totalChurn', 'lambda'], added + removed);

  const cards = [
    {
      key: 'added',
      title: (
        <Tooltip title="Lines added across the commit set">
          <span>Total added</span>
        </Tooltip>
      ),
      value: added,
      formatter: (v) => formatNumber(v),
      color: '#16a34a',
      prefix: <ArrowUpOutlined />,
      suffix: 'lines'
    },
    {
      key: 'removed',
      title: (
        <Tooltip title="Lines removed across the commit set">
          <span>Total removed</span>
        </Tooltip>
      ),
      value: removed,
      formatter: (v) => formatNumber(v),
      color: '#dc2626',
      prefix: <ArrowDownOutlined />,
      suffix: 'lines'
    },
    {
      key: 'growth',
      title: (
        <Tooltip title="Net change in lines: added − removed">
          <span>Growth</span>
        </Tooltip>
      ),
      value: growth,
      formatter: (v) => formatSigned(v),
      color: growth >= 0 ? '#16a34a' : '#dc2626',
      suffix: 'lines'
    },
    {
      key: 'churn',
      title: (
        <Tooltip title="Changed lines: added + removed">
          <span>Churn</span>
        </Tooltip>
      ),
      value: churn,
      formatter: (v) => formatNumber(v),
      color: '#d97706',
      suffix: 'lines'
    }
  ];

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col xs={24} sm={12} xl={6} key={card.key}>
          <Card size="small">
            {loading ? (
              <Skeleton active paragraph={{ rows: 1, width: '80%' }} title={{ width: '50%' }} />
            ) : (
              <Statistic
                className="rat-stat"
                title={<Typography.Text type="secondary">{card.title}</Typography.Text>}
                value={card.value}
                formatter={card.formatter}
                prefix={card.prefix}
                suffix={<span style={{ fontSize: 12, color: '#94a3b8' }}>{card.suffix}</span>}
                valueStyle={{ color: card.color }}
              />
            )}
          </Card>
        </Col>
      ))}
    </Row>
  );
}
