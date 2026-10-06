import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useFilters } from '../../context/FilterContext.jsx';

const { RangePicker } = DatePicker;

const toDay = (iso) => (iso ? dayjs(iso) : null);

/**
 * Commit date range picker — writes { from, to } (ISO strings) to FilterContext.
 */
export default function TimeRangeFilter({ style }) {
  const { from, to, setTimeRange } = useFilters();

  const handleChange = (dates) => {
    if (!dates || !dates[0] || !dates[1]) {
      setTimeRange(null, null);
      return;
    }
    // Inclusive whole days: start of first day .. end of last day.
    setTimeRange(dates[0].startOf('day').toISOString(), dates[1].endOf('day').toISOString());
  };

  return (
    <RangePicker
      value={from && to ? [toDay(from), toDay(to)] : null}
      onChange={handleChange}
      allowClear
      style={{ width: 250, ...style }}
      placeholder={['From date', 'To date']}
    />
  );
}
