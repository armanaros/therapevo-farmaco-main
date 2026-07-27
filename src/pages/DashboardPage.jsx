import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid2 as Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  MenuItem,
  LinearProgress,
  Chip,
  Alert,
  AlertTitle,
  Stack,
  alpha,
  useTheme,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  AttachMoney,
  ShoppingCart,
  TrendingUp,
  HourglassTop,
  Settings,
  Schedule,
  Warning,
  AccountBalance,
  Inventory2,
  BarChart,
  PointOfSale,
  ErrorOutline,
} from '@mui/icons-material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import AppLayout from '@/components/layout/AppLayout';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import useAuth from '@/hooks/useAuth';
import useMenu from '@/hooks/useMenu';
import { useRestaurant } from '@/hooks/useRestaurant';
import { getReportData } from '@/services/report.service';
import { formatCurrency } from '@/utils/formatters';
import { getManilaDayRange } from '@/utils/dateHelpers';
import { useNotifications } from '@/contexts/NotificationContext';
import { subscribeToLowStockItems } from '@/services/inventory.service';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';

const CHART_COLORS = {
  primary: '#16A34A',
  secondary: '#0891B2',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#6366F1',
};

const PIE_COLORS_ORDER = [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning];
const PIE_COLORS_PAYMENT = [CHART_COLORS.success, CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.warning];

// --- Custom Tooltip ---
const CustomBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      bgcolor: 'rgba(30,30,40,0.92)',
      borderRadius: 1.5,
      px: 2,
      py: 1.5,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>
        {formatCurrency(payload[0].value)}
      </Typography>
      {payload[0]?.payload?.orders !== undefined && (
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          {payload[0].payload.orders} orders
        </Typography>
      )}
    </Box>
  );
};

const CustomPieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <Box sx={{
      bgcolor: 'rgba(30,30,40,0.92)',
      borderRadius: 1.5,
      px: 2,
      py: 1,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>
        {name}
      </Typography>
      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>
        {value} orders
      </Typography>
    </Box>
  );
};

// --- Custom Legend ---
const CustomLegend = ({ payload }) => (
  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1, flexWrap: 'wrap' }}>
    {payload?.map((entry, i) => (
      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
          {entry.value}
        </Typography>
      </Box>
    ))}
  </Box>
);

// --- Metric Card ---
const MetricCard = ({ title, value, subtitle, icon, color = 'primary.main' }) => (
  <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', height: '100%' }}>
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', height: '100%' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', letterSpacing: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ visibility: subtitle ? 'visible' : 'hidden' }}>
            {subtitle || '\u00A0'}
          </Typography>
        </Box>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 3,
            background: `linear-gradient(135deg, ${color.replace('.main', '')} 0%, ${color.replace('.main', '')} 100%)`,
            backgroundColor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

// --- Active Pie Label (inside donut) ---
const renderCenterLabel = (data) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return ({ viewBox }) => {
    const { cx, cy } = viewBox;
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
        <tspan x={cx} dy="-0.4em" fontSize="22" fontWeight="700" fill="#333">{total}</tspan>
        <tspan x={cx} dy="1.4em" fontSize="11" fill="#999">total</tspan>
      </text>
    );
  };
};

export default function DashboardPage() {
  const theme = useTheme();
  const { user, isSalesRep } = useAuth();
  const { restaurantId } = useRestaurant();
  const { items, loading: menuLoading } = useMenu();
  const { upcomingInstallments = [] } = useNotifications();
  const navigate = useNavigate();

  // Sales reps have their own portal page
  useEffect(() => {
    if (isSalesRep?.()) navigate('/med-rep', { replace: true });
  }, [isSalesRep, navigate]);

  const [range, setRange] = useState('1');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [outstandingAR, setOutstandingAR] = useState(0);

  // Low stock subscription
  useEffect(() => subscribeToLowStockItems(setLowStockItems), []);

  // Pending approvals count
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.SALES_TRANSACTIONS), where('status', '==', 'pending_approval'));
    return onSnapshot(q, (snap) => setPendingApprovals(snap.size));
  }, []);

  // Outstanding AR balance
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.ACCOUNTS_RECEIVABLE), where('status', 'in', ['current', 'overdue']));
    return onSnapshot(q, (snap) => {
      const total = snap.docs.reduce((sum, d) => sum + (d.data().balance || 0), 0);
      setOutstandingAR(total);
    });
  }, []);
  
  // Widget visibility state (persisted in localStorage)
  const [widgets, setWidgets] = useState(() => {
    const saved = localStorage.getItem('dashboard_widgets');
    const defaults = { salesChart: true, orderTypes: true, paymentMethods: true, topItems: true };
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    // strip legacy 'metrics' key — metrics are always shown
    const { metrics: _m, ...rest } = parsed;
    return { ...defaults, ...rest };
  });

  const toggleWidget = (key) => {
    setWidgets((prev) => {
      const newWidgets = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashboard_widgets', JSON.stringify(newWidgets));
      return newWidgets;
    });
  };

  useEffect(() => {
    const load = async () => {
      setReportLoading(true);
      let start, end, useManilaTz = false;
      
      if (range === '1') {
        // "Today" - use Manila timezone-aware day range
        const manilaRange = getManilaDayRange();
        start = manilaRange.start;
        end = manilaRange.end;
        useManilaTz = true;
      } else {
        // Other ranges - calculate from today minus N days
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - Number(range) + 1); // +1 so "Last 7 Days" is actually 7 days
        start.setHours(0, 0, 0, 0);
      }
      
      const result = await getReportData(start, end, restaurantId || '', useManilaTz);
      setReportData(result);
      setReportLoading(false);
    };
    load();
  }, [range, restaurantId]);

  const loading = menuLoading || reportLoading;

  const typeData = useMemo(() => {
    if (!reportData) return [];
    return Object.entries(reportData.ordersByType).map(([name, value]) => ({ name, value }));
  }, [reportData]);

  const paymentData = useMemo(() => {
    if (!reportData) return [];
    return Object.entries(reportData.ordersByPayment).map(([name, value]) => ({ name, value }));
  }, [reportData]);

  // Format sales data for nicer X axis labels
  const formattedSalesData = useMemo(() => {
    if (!reportData?.salesByDay) return [];
    return reportData.salesByDay.map((d) => ({
      ...d,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    }));
  }, [reportData]);

  // Top items with percentage bars
  const topItemsMax = useMemo(() => {
    if (!reportData?.topItems?.length) return 0;
    return Math.max(...reportData.topItems.map((i) => i.quantity));
  }, [reportData]);

  if (loading || !reportData) {
    return (
      <AppLayout>
        <LoadingSpinner />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Welcome back, {user?.firstName || 'User'}
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: '0.9rem' }}>
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <IconButton onClick={() => setSettingsOpen(true)} title="Dashboard Settings">
              <Settings />
            </IconButton>
            <TextField
              select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              size="small"
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="1">Today</MenuItem>
              <MenuItem value="7">Last 7 Days</MenuItem>
              <MenuItem value="30">Last 30 Days</MenuItem>
              <MenuItem value="90">Last 90 Days</MenuItem>
            </TextField>
          </Box>
        </Box>

        {/* ── Quick Actions ── */}
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {[
            { label: 'New Sale', icon: <PointOfSale fontSize="small" />, path: '/sales', color: 'success' },
            { label: 'Receivables', icon: <AccountBalance fontSize="small" />, path: '/accounts-receivable', color: 'info' },
            { label: 'Inventory', icon: <Inventory2 fontSize="small" />, path: '/inventory', color: 'secondary' },
            { label: 'Reports', icon: <BarChart fontSize="small" />, path: '/reports', color: 'warning' },
          ].map(({ label, icon, path, color }) => (
            <Grid size={{ xs: 6, sm: 3 }} key={label}>
              <Button
                fullWidth
                variant="outlined"
                color={color}
                startIcon={icon}
                onClick={() => navigate(path)}
                sx={{ borderRadius: 2, py: 1, fontWeight: 600, fontSize: '0.8rem', textTransform: 'none' }}
              >
                {label}
              </Button>
            </Grid>
          ))}
        </Grid>

        {/* ── Metric cards — always pinned at top ── */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <MetricCard
              title="TOTAL REVENUE"
              value={formatCurrency(reportData.totalRevenue)}
              subtitle={`${reportData.totalOrders} fulfilled`}
              icon={<AttachMoney sx={{ color: '#fff' }} />}
              color="success.main"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <MetricCard
              title="TRANSACTIONS"
              value={reportData.totalOrders}
              subtitle={`${reportData.totalOrders} fulfilled orders`}
              icon={<ShoppingCart sx={{ color: '#fff' }} />}
              color="info.main"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <MetricCard
              title="PENDING APPROVAL"
              value={pendingApprovals}
              subtitle={pendingApprovals === 1 ? '1 sale needs approval' : pendingApprovals > 1 ? `${pendingApprovals} sales need approval` : 'No pending approvals'}
              icon={<HourglassTop sx={{ color: '#fff' }} />}
              color="warning.main"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <MetricCard
              title="OUTSTANDING AR"
              value={formatCurrency(outstandingAR)}
              subtitle="Total unpaid receivables"
              icon={<AccountBalance sx={{ color: '#fff' }} />}
              color="secondary.main"
            />
          </Grid>
        </Grid>

        {/* ── Low Stock Alert ── */}
        {lowStockItems.length > 0 && (
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'error.light', borderRadius: 2, mb: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: '#fff1f2', borderBottom: '1px solid', borderColor: 'error.light', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Warning sx={{ color: 'error.main', fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={700} color="error.dark">
                {lowStockItems.length} Product{lowStockItems.length > 1 ? 's' : ''} Low on Stock
              </Typography>
              <Chip label="Needs Restocking" size="small" color="error" sx={{ ml: 'auto', height: 20, fontSize: '0.7rem' }} />
            </Box>
            <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
              <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
                {lowStockItems.map((item) => {
                  const stock = item.stockLevel ?? 0;
                  const threshold = item.reorderLevel ?? item.lowStockThreshold ?? 5;
                  const pct = threshold > 0 ? Math.min(100, (stock / threshold) * 100) : 0;
                  return (
                    <Box key={item.id} onClick={() => navigate('/inventory')}
                      sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', cursor: 'pointer', '&:hover': { bgcolor: '#fff1f2' } }}>
                      <Box sx={{ flex: 1, minWidth: 140 }}>
                        <Typography variant="body2" fontWeight={700}>{item.name || item.productName}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.category || item.genericName || ''}</Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 120 }}>
                        <Typography variant="caption" color="text.secondary">Stock Level</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LinearProgress variant="determinate" value={pct}
                            sx={{ flex: 1, height: 6, borderRadius: 3,
                              bgcolor: '#fee2e2',
                              '& .MuiLinearProgress-bar': { bgcolor: stock === 0 ? 'error.main' : 'warning.main' }
                            }} />
                          <Typography variant="caption" fontWeight={700}
                            color={stock === 0 ? 'error.main' : 'warning.main'}>
                            {stock}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right', minWidth: 80 }}>
                        {stock === 0
                          ? <Chip label="OUT OF STOCK" size="small" color="error" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                          : <Chip label="LOW STOCK" size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                        }
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                          Reorder: {threshold}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Card>
        )}

        {/* Upcoming installment payment alerts */}
        {upcomingInstallments.length > 0 && (
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'warning.light', borderRadius: 2, mb: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'warning.50', borderBottom: '1px solid', borderColor: 'warning.light', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Schedule sx={{ color: 'warning.main', fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={700} color="warning.dark">
                {upcomingInstallments.length} Upcoming Installment Payment{upcomingInstallments.length > 1 ? 's' : ''}
              </Typography>
              <Chip label="Due within 5 days" size="small" color="warning" sx={{ ml: 'auto', height: 20, fontSize: '0.7rem' }} />
            </Box>
            <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
            <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
              {upcomingInstallments.map((r) => {
                const amountPaid = r.amountPaid || 0;
                const instAmt = r.installmentAmount || 0;
                const ip = instAmt > 0 ? Math.floor(amountPaid / instAmt) : 0;
                const firstDue = r.firstInstallmentDue;
                const freq = r.installmentFrequency || 'monthly';
                const nd = (() => {
                  if (!firstDue) return null;
                  const d = firstDue?.toDate ? firstDue.toDate() : new Date(firstDue);
                  const res = new Date(d);
                  if (freq === 'weekly') res.setDate(res.getDate() + ip * 7);
                  else if (freq === 'bi_monthly') res.setDate(res.getDate() + ip * 14);
                  else res.setMonth(res.getMonth() + ip);
                  return res;
                })();
                const daysUntil = nd ? Math.ceil((nd - new Date()) / 86400000) : null;
                const pct = r.installmentTotal > 0 ? Math.min(100, (ip / r.installmentTotal) * 100) : 0;
                return (
                  <Box
                    key={r.id}
                    onClick={() => navigate(`/accounts-receivable?highlight=${r.id}`)}
                    sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', cursor: 'pointer', '&:hover': { bgcolor: 'warning.50' } }}
                  >
                    <Box sx={{ flex: 1, minWidth: 160 }}>
                      <Typography variant="body2" fontWeight={700}>{r.customerName}</Typography>
                      {r.invoiceNumber && (
                        <Typography variant="caption" color="text.secondary">Invoice #{r.invoiceNumber}</Typography>
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 120 }}>
                      <Typography variant="caption" color="text.secondary">Progress</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LinearProgress variant="determinate" value={pct}
                          sx={{ flex: 1, height: 6, borderRadius: 3 }}
                          color={pct >= 100 ? 'success' : 'warning'} />
                        <Typography variant="caption" fontWeight={700}>{ip}/{r.installmentTotal}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight={700} color="warning.dark">
                        {formatCurrency(instAmt)}
                      </Typography>
                      <Typography variant="caption"
                        color={daysUntil != null && daysUntil <= 0 ? 'error.main' : 'warning.main'}>
                        {nd ? nd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}
                        {daysUntil != null && (daysUntil <= 0 ? ' — OVERDUE' : daysUntil === 0 ? ' — TODAY' : ` — in ${daysUntil}d`)}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
            </Box>
          </Card>
        )}

        {/* Sales Area Chart */}
        {widgets.salesChart && (
        <Card sx={{ mb: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Revenue Trend</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Distribution revenue for the selected period
            </Typography>
            <Box sx={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedSalesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.4)} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    dx={-4}
                  />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2.5}
                    fill="url(#salesGradient)"
                    dot={{ r: 4, fill: '#fff', stroke: CHART_COLORS.primary, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: CHART_COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
        )}

        {/* Donut Charts */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {widgets.orderTypes && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Transaction Types</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Breakdown by order category
                </Typography>
                {typeData.length > 0 ? (
                  <Box sx={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={typeData}
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={85}
                          dataKey="value"
                          paddingAngle={3}
                          cornerRadius={4}
                          label={false}
                        >
                          {typeData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS_ORDER[i % PIE_COLORS_ORDER.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                        <Legend content={<CustomLegend />} verticalAlign="bottom" />
                        <text x="50%" y="40%" textAnchor="middle" dominantBaseline="central">
                          <tspan fontSize="22" fontWeight="700" fill={theme.palette.text.primary}>
                            {typeData.reduce((s, d) => s + d.value, 0)}
                          </tspan>
                        </text>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
                          <tspan fontSize="11" fill={theme.palette.text.secondary}>total</tspan>
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No data yet</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
          )}

          {widgets.paymentMethods && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Payment Methods</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Breakdown by payment mode
                </Typography>
                {paymentData.length > 0 ? (
                  <Box sx={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={85}
                          dataKey="value"
                          paddingAngle={3}
                          cornerRadius={4}
                          label={false}
                        >
                          {paymentData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS_PAYMENT[i % PIE_COLORS_PAYMENT.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                        <Legend content={<CustomLegend />} verticalAlign="bottom" />
                        <text x="50%" y="40%" textAnchor="middle" dominantBaseline="central">
                          <tspan fontSize="22" fontWeight="700" fill={theme.palette.text.primary}>
                            {paymentData.reduce((s, d) => s + d.value, 0)}
                          </tspan>
                        </text>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
                          <tspan fontSize="11" fill={theme.palette.text.secondary}>total</tspan>
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No data yet</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
          )}
        </Grid>

        {/* Top Items with progress bars */}
        {widgets.topItems && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Top Products</Typography>
                <Typography variant="caption" color="text.secondary">
                  Best-selling pharmaceutical items for the period
                </Typography>
              </Box>
              <Chip label={`${reportData.topItems.length} items`} size="small" variant="outlined" />
            </Box>
            {reportData.topItems.length > 0 ? (
              <Box>
                {reportData.topItems.map((item, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      py: 1.5,
                      borderBottom: i < reportData.topItems.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: i < 3
                          ? `linear-gradient(135deg, ${CHART_COLORS.primary}, ${CHART_COLORS.secondary})`
                          : 'action.hover',
                        color: i < 3 ? '#fff' : 'text.secondary',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {item.name}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0, ml: 1 }}>
                          {formatCurrency(item.revenue)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={topItemsMax > 0 ? (item.quantity / topItemsMax) * 100 : 0}
                          sx={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            bgcolor: alpha(CHART_COLORS.primary, 0.1),
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 3,
                              background: `linear-gradient(90deg, ${CHART_COLORS.primary}, ${CHART_COLORS.secondary})`,
                            },
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 50, textAlign: 'right' }}>
                          {item.quantity} sold
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No sales data yet</Typography>
              </Box>
            )}
          </CardContent>
        </Card>
        )}

        {/* Settings Dialog */}
        <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Dashboard Settings</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose which widgets to display on your dashboard.
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={<Switch checked={widgets.salesChart} onChange={() => toggleWidget('salesChart')} />}
                label="Sales Overview Chart"
              />
              <FormControlLabel
                control={<Switch checked={widgets.orderTypes} onChange={() => toggleWidget('orderTypes')} />}
                label="Order Types Distribution"
              />
              <FormControlLabel
                control={<Switch checked={widgets.paymentMethods} onChange={() => toggleWidget('paymentMethods')} />}
                label="Payment Methods Distribution"
              />
              <FormControlLabel
                control={<Switch checked={widgets.topItems} onChange={() => toggleWidget('topItems')} />}
                label="Top Selling Items"
              />
            </FormGroup>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSettingsOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </AppLayout>
  );
}
