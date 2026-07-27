import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Grid2 as Grid,
  Card,
  CardContent,
  TextField,
  Stack,
  Divider,
  Chip,
  Button,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  TrendingUp,
  ShoppingCart,
  AttachMoney,
  Cancel,
  CheckCircle,
  Print,
  CalendarMonth,
  AccountBalanceWallet,
  TrendingDown,
  Savings,
  AccessTime,
  Medication,
  LocalPharmacy,
} from '@mui/icons-material';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import AppLayout from '@/components/layout/AppLayout';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useRestaurant } from '@/hooks/useRestaurant';
import { getReportData } from '@/services/report.service';
import { formatCurrency } from '@/utils/formatters';

const PRIMARY = '#16A34A';
const PRIMARY_DARK = '#15803D';
const SECONDARY = '#0891B2';
const PIE_COLORS = ['#16A34A', '#0891B2', '#F59E0B', '#EF4444', '#6366F1', '#22C55E'];
const PAGE_BG = '#F3F6F5';
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)';
const CR = 3; // card border-radius MUI unit = 24px

const toInputDate = (d) => d.toISOString().split('T')[0];

const PRESETS = [
  { label: 'Today', value: 'today' },
  { label: '7D', value: '7' },
  { label: '30D', value: '30' },
  { label: '90D', value: '90' },
  { label: 'Custom', value: 'custom' },
];

const STATUS_COLORS = {
  completed: '#10b981', served: '#10b981', delivered: '#10b981',
  cancelled: '#ef4444',
  pending: '#f59e0b',
  preparing: '#667eea',
  ready: '#3b82f6',
};

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Card sx={{ p: 1.5, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', borderRadius: 2, border: 'none' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, color: PRIMARY }}>{formatCurrency(payload[0].value)}</Typography>
      {payload[0]?.payload?.orders != null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {payload[0].payload.orders} orders
        </Typography>
      )}
    </Card>
  );
}

function HeroCard({ value, sub, periodLabel }) {
  return (
    <Card sx={{
      height: '100%', borderRadius: CR, border: 'none',
      background: `linear-gradient(135deg, #0D1F15 0%, #15803D 50%, ${PRIMARY} 100%)`,
      boxShadow: `0 8px 32px ${PRIMARY}55`,
      position: 'relative', overflow: 'hidden',
    }}>
      <Box sx={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
      <Box sx={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, position: 'relative' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AttachMoney sx={{ color: '#fff', fontSize: 18 }} />
          </Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: 0.4 }}>
            Total Revenue
          </Typography>
        </Box>
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 800, lineHeight: 1.1, mb: 0.5 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', display: 'block', mt: 0.5 }}>
            {sub}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 1.5, fontSize: '0.67rem' }}>
          Period: {periodLabel}
        </Typography>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, sub, icon, color = PRIMARY }) {
  return (
    <Card sx={{ height: '100%', borderRadius: CR, boxShadow: CARD_SHADOW, border: 'none' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1, mb: 0.5 }}>{value}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontSize: '0.68rem' }}>{sub}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { restaurantId } = useRestaurant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState('7');
  const todayRef = useRef(new Date());
  // refresh todayRef each time the component is used
  useEffect(() => { todayRef.current = new Date(); }, []);
  const today = todayRef.current;
  const [customStart, setCustomStart] = useState(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toInputDate(today));
  const [appliedCustom, setAppliedCustom] = useState(false);

  useEffect(() => {
    if (preset === 'custom' && !appliedCustom) return;
    const load = async () => {
      setLoading(true);
      let start, end;
      if (preset === 'custom') {
        start = new Date(customStart);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      } else if (preset === 'today') {
        start = new Date(); start.setHours(0, 0, 0, 0);
        end = new Date(); end.setHours(23, 59, 59, 999);
      } else {
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - Number(preset));
      }
      const result = await getReportData(start, end, restaurantId || '');
      setData(result);
      setLoading(false);
      setAppliedCustom(false);
    };
    load();
  }, [preset, appliedCustom, restaurantId]);

  const periodLabel = preset === 'today'
    ? 'Today'
    : preset === 'custom'
    ? customStart + ' \u2013 ' + customEnd
    : 'Last ' + preset + ' Days';

  const completionRate = data && data.totalOrders > 0
    ? ((data.totalOrders - data.cancelled) / data.totalOrders * 100).toFixed(1)
    : '0.0';

  const typeData = data ? Object.entries(data.ordersByType).map(([name, value]) => ({ name, value })) : [];
  const paymentData = data ? Object.entries(data.ordersByPayment).map(([name, value]) => ({ name, value })) : [];
  const statusData = data ? Object.entries(data.ordersByStatus).map(([name, value]) => ({ name, value })) : [];
  const totalRevenue = data?.totalRevenue || 0;

  // Hourly chart: only show hours with activity, or 6am—6am—11pm window
  const hourlyData = data?.salesByHour
    ? data.salesByHour.filter((h) => h.hour >= 6 && h.hour <= 23)
    : [];
  const hasHourlyData = hourlyData.some((h) => h.orders > 0);

  const donutData = paymentData.length > 0 ? paymentData : typeData;
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <AppLayout>
      <Box sx={{ bgcolor: PAGE_BG, minHeight: '100vh', p: { xs: 2, md: 3 } }}>

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
              <LocalPharmacy sx={{ fontSize: 13, color: 'text.disabled' }} />
              <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.62rem' }}>
                Therapevo Farmaco
              </Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              Report Overview
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Pill preset buttons */}
            <Card sx={{ borderRadius: 10, boxShadow: CARD_SHADOW, border: 'none', display: 'flex', alignItems: 'center', p: '4px 6px', gap: 0.25 }}>
              <CalendarMonth sx={{ fontSize: 15, color: 'text.disabled', ml: 0.75, mr: 0.25 }} />
              {PRESETS.map((p) => (
                <Button
                  key={p.value}
                  size="small"
                  onClick={() => { setPreset(p.value); setAppliedCustom(false); }}
                  sx={{
                    minWidth: 0, px: 1.5, py: 0.4, borderRadius: 10,
                    textTransform: 'none', fontSize: '0.78rem',
                    fontWeight: preset === p.value ? 700 : 500,
                    bgcolor: preset === p.value ? PRIMARY : 'transparent',
                    color: preset === p.value ? '#fff' : 'text.secondary',
                    '&:hover': { bgcolor: preset === p.value ? PRIMARY_DARK : 'rgba(0,0,0,0.05)' },
                    transition: 'all 0.15s',
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </Card>

            {preset === 'custom' && (
              <Card sx={{ borderRadius: 2.5, boxShadow: CARD_SHADOW, border: 'none', p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField label="From" type="date" size="small" value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  InputLabelProps={{ shrink: true }} inputProps={{ max: customEnd }} sx={{ width: 140 }} />
                <TextField label="To" type="date" size="small" value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }} inputProps={{ min: customStart, max: toInputDate(today) }} sx={{ width: 140 }} />
                <Button variant="contained" size="small" onClick={() => setAppliedCustom(true)}
                  disabled={!customStart || !customEnd}
                  sx={{ bgcolor: PRIMARY, textTransform: 'none', fontWeight: 700, borderRadius: 2, '&:hover': { bgcolor: PRIMARY_DARK } }}>
                  Apply
                </Button>
              </Card>
            )}

            <Button variant="contained" startIcon={<Print />} onClick={() => window.print()} size="small"
              sx={{ bgcolor: '#1E293B', color: '#fff', borderRadius: 2, textTransform: 'none', fontWeight: 600,
                boxShadow: 'none', px: 2, '&:hover': { bgcolor: '#0F172A', boxShadow: 'none' } }}>
              Print
            </Button>
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ py: 16, display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner />
          </Box>
        ) : !data ? null : (
          <>
            {/* ── KPI Row ──────────────────────────────────────────────── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <HeroCard
                  value={formatCurrency(data.totalRevenue)}
                  sub={`Net profit: ${formatCurrency(data.netProfit)}`}
                  periodLabel={periodLabel}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 'grow' }}>
                <StatCard label="Transactions" value={data.totalOrders}
                  sub={(data.totalOrders - data.cancelled) + ' completed'}
                  icon={<ShoppingCart sx={{ fontSize: 20 }} />} color={SECONDARY} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 'grow' }}>
                <StatCard label="Avg Transaction" value={formatCurrency(data.avgOrder)}
                  icon={<TrendingUp sx={{ fontSize: 20 }} />} color="#F59E0B" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 'grow' }}>
                <StatCard label="Fulfillment Rate" value={completionRate + '%'}
                  icon={<CheckCircle sx={{ fontSize: 20 }} />} color="#22C55E" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 'grow' }}>
                <StatCard label="Void / Cancelled" value={data.cancelled}
                  icon={<Cancel sx={{ fontSize: 20 }} />} color="#EF4444" />
              </Grid>
            </Grid>

            {/* ── Chart + Donut Row ─────────────────────────────────────── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
              {/* Area / Bar chart */}
              <Grid size={{ xs: 12, md: 8 }}>
                <Card sx={{ borderRadius: CR, boxShadow: CARD_SHADOW, border: 'none', height: '100%' }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>
                          {preset === 'today' ? 'Sales by Hour' : 'Revenue Trend'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{periodLabel}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: PRIMARY }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Revenue</Typography>
                      </Box>
                    </Box>

                    {preset === 'today' ? (
                      !hasHourlyData ? (
                        <Box sx={{ py: 9, textAlign: 'center' }}>
                          <AccessTime sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                          <Typography color="text.secondary" sx={{ fontWeight: 600 }}>No sales recorded yet today</Typography>
                          <Typography variant="caption" color="text.disabled">Sales will appear here as orders are completed</Typography>
                        </Box>
                      ) : (
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={hourlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={PRIMARY} stopOpacity={1} />
                                <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.6} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                            <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                              tickFormatter={(h) => h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'} />
                            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={52}
                              tickFormatter={(v) => '₱' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
                            <Tooltip
                              formatter={(val, name) => name === 'revenue' ? [formatCurrency(val), 'Revenue'] : [val, 'Orders']}
                              labelFormatter={(h) => h < 12 ? h + ':00 AM' : h === 12 ? '12:00 PM' : (h - 12) + ':00 PM'}
                              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                            />
                            <Bar dataKey="revenue" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )
                    ) : data.salesByDay.length === 0 ? (
                      <Box sx={{ py: 9, textAlign: 'center' }}>
                        <Typography color="text.secondary">No sales data for this period</Typography>
                      </Box>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={data.salesByDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.14} />
                              <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                            tickFormatter={(v) => new Date(v + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} />
                          <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={52}
                            tickFormatter={(v) => '₱' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
                          <Tooltip content={<RevenueTooltip />} />
                          <Area type="monotone" dataKey="revenue" stroke={PRIMARY} strokeWidth={2.5}
                            fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: PRIMARY, strokeWidth: 2, stroke: '#fff' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Donut breakdown */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ borderRadius: CR, boxShadow: CARD_SHADOW, border: 'none', height: '100%' }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>
                      {paymentData.length > 0 ? 'By Payment Method' : 'By Transaction Type'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                      Distribution breakdown
                    </Typography>

                    {donutData.length === 0 ? (
                      <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography color="text.secondary" variant="body2">No data available</Typography>
                      </Box>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={170}>
                          <PieChart>
                            <Pie data={donutData} cx="50%" cy="50%" innerRadius={52} outerRadius={76}
                              dataKey="value" paddingAngle={3} strokeWidth={0}>
                              {donutData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(val) => [val + ' orders', '']}
                              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <Divider sx={{ my: 1.5 }} />
                        <Stack spacing={1.25}>
                          {donutData.map((r, i) => {
                            const pct = donutTotal > 0 ? ((r.value / donutTotal) * 100).toFixed(0) : 0;
                            return (
                              <Box key={i}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                                    <Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 500 }}>{r.name}</Typography>
                                  </Box>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{pct}%</Typography>
                                </Box>
                                <LinearProgress variant="determinate" value={Number(pct)}
                                  sx={{
                                    height: 4, borderRadius: 2,
                                    bgcolor: PIE_COLORS[i % PIE_COLORS.length] + '20',
                                    '& .MuiLinearProgress-bar': { bgcolor: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 2 },
                                  }}
                                />
                              </Box>
                            );
                          })}
                        </Stack>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* ── Finance Summary Row ─────────────────────────────────── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
              {[
                { label: 'Total Revenue', value: formatCurrency(data.totalRevenue), icon: <AccountBalanceWallet sx={{ fontSize: 20 }} />, color: '#22C55E' },
                { label: 'Total Expenses', value: formatCurrency(data.totalExpenses), icon: <TrendingDown sx={{ fontSize: 20 }} />, color: '#EF4444' },
                {
                  label: 'Net Profit',
                  value: formatCurrency(data.netProfit),
                  sub: data.totalRevenue > 0 ? ((data.netProfit / data.totalRevenue) * 100).toFixed(1) + '% margin' : undefined,
                  icon: <Savings sx={{ fontSize: 20 }} />,
                  color: data.netProfit >= 0 ? '#22C55E' : '#EF4444',
                },
              ].map((card, i) => (
                <Grid key={i} size={{ xs: 12, sm: 4 }}>
                  <StatCard {...card} />
                </Grid>
              ))}
            </Grid>

            {/* ── Top Products Table ────────────────────────────────────── */}
            <Card sx={{ borderRadius: CR, boxShadow: CARD_SHADOW, border: 'none', mb: 3 }}>
              <CardContent sx={{ p: 2.5, pb: '12px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>Top Selling Products</Typography>
                    <Typography variant="caption" color="text.secondary">Revenue contribution per product</Typography>
                  </Box>
                  <Chip label={data.topItems.length + ' products'} size="small"
                    sx={{ bgcolor: PRIMARY + '14', color: PRIMARY, fontWeight: 700, fontSize: '0.72rem' }} />
                </Box>
              </CardContent>

              {data.topItems.length === 0 ? (
                <CardContent sx={{ py: 5, textAlign: 'center' }}>
                  <Medication sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary" variant="body2">No products sold in this period</Typography>
                </CardContent>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#F0FDF4' }}>
                        {['#', 'PRODUCT', 'CATEGORY', 'UNITS', 'REVENUE', 'SHARE'].map((h, i) => (
                          <TableCell key={h} align={i >= 3 ? 'right' : 'left'}
                            sx={{ fontWeight: 700, fontSize: '0.68rem', color: PRIMARY_DARK, py: 1.5, letterSpacing: 0.6, border: 'none',
                              ...(i === 0 && { width: 48, pl: 3 }), ...(i === 5 && { pr: 3 }) }}>
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.topItems.map((item, i) => {
                        const pct = totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : '0.0';
                        const rankColor = i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#B45309' : '#CBD5E1';
                        return (
                          <TableRow key={i} sx={{ '&:hover': { bgcolor: '#F0FDF4' }, '&:last-child td': { borderBottom: 0 } }}>
                            <TableCell sx={{ py: 1.75, pl: 3 }}>
                              <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: rankColor + '22',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography sx={{ color: rankColor, fontWeight: 800, fontSize: '0.68rem' }}>{i + 1}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ py: 1.75 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.name}</Typography>
                            </TableCell>
                            <TableCell sx={{ py: 1.75 }}>
                              {item.categoryName
                                ? <Chip label={item.categoryName} size="small" sx={{ fontSize: '0.68rem', height: 20, bgcolor: '#F0FDF4', color: '#15803D', fontWeight: 600 }} />
                                : <Typography variant="caption" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.75 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.quantity.toLocaleString()}</Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.75 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: '#1E293B' }}>{formatCurrency(item.revenue)}</Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.75, pr: 3 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                                <Box sx={{ width: 48, height: 4, borderRadius: 2, bgcolor: '#DCFCE7', overflow: 'hidden' }}>
                                  <Box sx={{ height: '100%', width: pct + '%', bgcolor: PRIMARY, borderRadius: 2 }} />
                                </Box>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: PRIMARY_DARK, minWidth: 34, textAlign: 'right' }}>
                                  {pct}%
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Card>

            {/* ── Transaction Status Summary ────────────────────────────── */}
            {statusData.length > 0 && (
              <Grid container spacing={2.5} sx={{ mb: 3 }}>
                {statusData.map((s, i) => {
                  const color = STATUS_COLORS[s.name] || '#94A3B8';
                  const pct = data.totalOrders > 0 ? ((s.value / data.totalOrders) * 100).toFixed(0) : 0;
                  return (
                    <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}>
                      <Card sx={{ borderRadius: CR, boxShadow: CARD_SHADOW, border: 'none' }}>
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="caption" sx={{ textTransform: 'capitalize', fontWeight: 600, color: 'text.secondary' }}>{s.name}</Typography>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                          </Box>
                          <Typography variant="h5" sx={{ fontWeight: 800, color, lineHeight: 1 }}>{s.value}</Typography>
                          <Typography variant="caption" color="text.secondary">{pct}% of orders</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}

            {/* ── Cancelled Transactions ────────────────────────────────── */}
            {data.cancelledOrders?.length > 0 && (
              <Card sx={{ borderRadius: CR, boxShadow: CARD_SHADOW, border: 'none', mb: 3 }}>
                <CardContent sx={{ p: 2.5, pb: '12px !important' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>Void / Cancelled Transactions</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {data.cancelledOrders.length} transaction{data.cancelledOrders.length !== 1 ? 's' : ''} voided this period
                  </Typography>
                </CardContent>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#FFF1F2' }}>
                        {['TXN #', 'TYPE', 'AMOUNT', 'TIME', 'REASON'].map((h) => (
                          <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.68rem', color: '#B91C1C', py: 1.5, letterSpacing: 0.6, border: 'none' }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.cancelledOrders.map((o) => (
                        <TableRow key={o.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>#{o.orderNumber}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{o.orderType || '—'}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="body2">{formatCurrency(o.total)}</Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {o.createdAt ? o.createdAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {o.cancelReason || <em style={{ opacity: 0.5 }}>No reason provided</em>}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            )}
          </>
        )}
      </Box>
    </AppLayout>
  );
}
