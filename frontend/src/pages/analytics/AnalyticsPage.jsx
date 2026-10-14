import { useState } from 'react';
import { AlertTriangle, Building2, ClipboardCheck, Clock, Download, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import PageHeader from '../../components/common/PageHeader';
import QueryBoundary from '../../components/common/QueryBoundary';
import { EmptyState } from '../../components/common/Feedback';
import Button from '../../components/ui/Button';
import { Card, ProgressBar, StatCard, StatGrid } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Tabs';
import { BarChart, HBarList, LineChart } from '../../components/charts/Charts';
import { downloadCsv } from '../../utils/csv';
import { pct } from '../../utils/format';

const PERIODS = [{ value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: '1y', label: '1 year' }];
const PERIOD_LABEL = { '30d': 'last 30 days', '90d': 'last 90 days', '1y': 'last year' };
const sum = a => a.reduce((s, v) => s + v, 0);
const tone = v => (v >= 85 ? 'red' : v >= 65 ? 'amber' : 'primary');

export default function AnalyticsPage() {
  const toast = useToast();
  const [period, setPeriod] = useState('30d');
  const q = useApi(() => api.get('/analytics/overview', { period }), [period]);
  const a = q.data?.data;

  const exportCsv = () => {
    const cols = [['requests', 'Requests'], ['approved', 'Approved'], ['cabinUtil', 'Cabin utilisation %'], ['roomAI', 'AI Lab utilisation %'], ['roomPod', 'Podcast Room utilisation %'], ['turnaround', 'Avg turnaround (hours)']];
    downloadCsv(`kif-analytics-${period}.csv`, a.labels.map((label, i) => ({ label, i })), [{ header: 'Period', value: r => r.label }, ...cols.map(([k, header]) => ({ header, value: r => a[k][r.i] }))]);
    toast.success('Analytics exported.');
  };
  const snap = a?.snapshot;

  return (
    <div className="page">
      <PageHeader title="Analytics" description={a ? `Utilisation, demand and turnaround across KIF. Updated ${new Date(a.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'Utilisation, demand and turnaround across KIF.'}
        actions={<>
          <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
          <Button icon={RefreshCw} loading={q.loading && !!a} onClick={q.reload}>Refresh</Button>
          <Button icon={Download} disabled={!a} onClick={exportCsv}>Export CSV</Button>
        </>} />
      <QueryBoundary query={q}>
        {a && (
          <div className={q.loading ? 'is-loading stack' : 'stack'}>
            <StatGrid>
              <StatCard icon={Building2} label="Cabin utilisation" value={`${snap.cabins.utilization}%`} hint={`${snap.cabins.inUse} of ${snap.cabins.usable} usable cabins`} />
              <StatCard icon={ClipboardCheck} tone="blue" label="Requests" value={sum(a.requests)} hint={`${pct(sum(a.approved), sum(a.requests))}% approved · ${PERIOD_LABEL[period]}`} />
              <StatCard icon={Clock} tone="purple" label="Request turnaround" value={`${a.turnaround[a.turnaround.length - 1]} h`} hint="Avg time to decision, latest period" />
              <StatCard icon={AlertTriangle} tone={snap.expiredAllotments ? 'red' : 'green'} label="Expired allotments" value={snap.expiredAllotments} hint={snap.expiredAllotments ? 'Past end date, not yet released' : 'None right now'} />
            </StatGrid>
            <div className="grid-2">
              <Card title="Request volume" description={`Requests received vs approved, ${PERIOD_LABEL[period]}.`}>
                <BarChart labels={a.labels} series={[{ name: 'Requests', tone: 'primary', values: a.requests }, { name: 'Approved', tone: 'blue', values: a.approved }]} label="Request volume" />
              </Card>
              <Card title="Cabin utilisation" description="Allotted cabin-days as a share of capacity."><LineChart labels={a.labels} unit="%" max={100} series={[{ name: 'Cabins', tone: 'primary', values: a.cabinUtil }]} label="Cabin utilisation" /></Card>
            </div>
            <div className="grid-2">
              <Card title="Room utilisation" description="Booked share of open hours (09:00–20:00).">
                <LineChart labels={a.labels} unit="%" max={100} series={[{ name: 'AI / Neural Lab', tone: 'blue', values: a.roomAI }, { name: 'Podcast Room', tone: 'purple', values: a.roomPod }]} label="Room utilisation" />
              </Card>
              <Card title="Request turnaround" description="Average hours from request to decision."><LineChart labels={a.labels} unit=" h" series={[{ name: 'Turnaround', tone: 'amber', values: a.turnaround }]} label="Request turnaround" /></Card>
            </div>
            <div className="grid-2">
              <Card title="Most requested hardware" description={`Units requested, ${PERIOD_LABEL[period]}.`}>
                {a.hardwareDemand.length ? <HBarList tone="purple" items={a.hardwareDemand} /> : <EmptyState compact title="No hardware requests in this period" />}
              </Card>
              <Card title="Resource utilisation right now" description="Live snapshot, independent of the period.">
                <div className="stack">
                  <ProgressBar label="Cabins" value={snap.cabins.utilization} tone={tone(snap.cabins.utilization)} />
                  <ProgressBar label="Hardware issued" value={snap.hardware.utilization} tone={tone(snap.hardware.utilization)} detail={`${snap.hardware.issued} of ${snap.hardware.total} units`} />
                  <ProgressBar label="Consumables healthy" value={pct(snap.consumables.total - snap.consumables.low, snap.consumables.total)} detail={`${snap.consumables.low} low of ${snap.consumables.total}`} />
                </div>
              </Card>
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
