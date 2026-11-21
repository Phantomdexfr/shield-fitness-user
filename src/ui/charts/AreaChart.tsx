import { AreaOf, type LineChartProps, type Series } from './LineChart';

export interface AreaChartProps extends Omit<LineChartProps, 'series' | 'target'> {
  series: [Series];
}

/** One series with a fill under the line (CHART_KIT 4.2). */
export function AreaChart(props: AreaChartProps) {
  return <AreaOf {...props} />;
}
