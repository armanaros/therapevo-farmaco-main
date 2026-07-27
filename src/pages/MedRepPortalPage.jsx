import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Grid2 as Grid, Button, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, IconButton, Avatar, Stack, LinearProgress, Alert,
  Divider, InputAdornment, CircularProgress,
} from '@mui/material';
import {
  Add, ReceiptLong, CheckCircle, HourglassTop, Cancel,
  AttachMoney, Search, Print, Close, TrendingUp,
} from '@mui/icons-material';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';
import AppLayout from '@/components/layout/AppLayout';
import useAuth from '@/hooks/useAuth';
import useProducts from '@/hooks/useProducts';
import { createSale } from '@/services/sales.service';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { printSaleReceipt } from '@/utils/receiptGenerator';
import toast from 'react-hot-toast';

// ─── Status helpers ─────────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending_approval: 'warning',
  approved:         'success',
  completed:        'success',
  rejected:         'error',
  cancelled:        'error',
  processing:       'info',
  delivered:        'success',
};
const STATUS_LABEL = {
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  completed:        'Completed',
  rejected:         'Rejected',
  cancelled:        'Cancelled',
  processing:       'Processing',
  delivered:        'Delivered',
};

// ─── Metric Card ───────────────────────────────────────────────────────────────────────
function MetricCard({ label, value, icon, color }) {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', fontSize: '0.62rem' }}>
              {label}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5 }}>{value}</Typography>
          </Box>
          <Box sx={{
            width: 44, height: 44, borderRadius: 2.5,
            background: `linear-gradient(135deg, ${color}, ${color}cc)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 12px ${color}44`,
          }}>
            <Box sx={{ color: '#fff' }}>{icon}</Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── New Sale Dialog ──────────────────────────────────────────────────────────────────
function NewSaleDialog({ open, onClose, onSubmitted, currentUser }) {
  const { products, loading: prodsLoading } = useProducts();
  const [step, setStep]           = useState(1); // 1=customer, 2=items, 3=review
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [productSearch, setProductSearch] = useState('');

  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', paymentMethod: 'cash', notes: '' });
  const [cartItems, setCartItems] = useState([]);
  const [discount, setDiscount]   = useState({ type: 'percent', value: '' });

  const availableProducts = useMemo(() =>
    products.filter((p) => p.isActive !== false && (p.stockLevel ?? 0) > 0 &&
      (!productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase())))
  , [products, productSearch]);

  const addToCart = (product) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        productId:   product.id,
        productName: product.name,
        unitPrice:   product.price ?? product.sellingPrice ?? 0,
        quantity:    1,
        unit:        product.unit || 'pc',
      }];
    });
  };

  const updateQty = (productId, qty) => {
    const n = Math.max(1, Number(qty) || 1);
    setCartItems((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: n } : i));
  };

  const removeFromCart = (productId) => setCartItems((prev) => prev.filter((i) => i.productId !== productId));

  const cartTotal = cartItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmt = useMemo(() => {
    const v = Number(discount.value) || 0;
    return discount.type === 'percent'
      ? cartTotal * (Math.min(100, v) / 100)
      : Math.min(cartTotal, v);
  }, [cartTotal, discount]);
  const finalTotal = cartTotal - discountAmt;

  const handleSubmit = async () => {
    if (!customer.name.trim()) { setError('Customer name is required'); return; }
    if (cartItems.length === 0) { setError('Add at least one product'); return; }
    setSaving(true); setError('');
    try {
      const saleData = {
        customerName:    customer.name.trim(),
        customerPhone:   customer.phone.trim(),
        customerAddress: customer.address.trim(),
        paymentMethod:   customer.paymentMethod,
        orderType:       'field_sale',
        notes:           customer.notes.trim(),
        subtotal:        cartTotal,
        discount:        discountAmt,
        total:           finalTotal,
        submittedByName: currentUser?.firstName ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim() : currentUser?.email,
      };
      const items = cartItems.map((i) => ({
        ...i,
        totalPrice: i.quantity * i.unitPrice,
      }));
      await createSale(saleData, items, currentUser?.uid, true /* requireApproval */, currentUser?.managerId || '', saleData.submittedByName);
      toast.success('Sale submitted for manager approval!');
      onSubmitted?.();
      handleClose();
    } catch (e) {
      setError(e.message || 'Failed to submit sale');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(1); setCustomer({ name: '', phone: '', address: '', paymentMethod: 'cash', notes: '' });
    setCartItems([]); setDiscount({ type: 'percent', value: '' }); setProductSearch(''); setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>New Sale</Typography>
          <Typography variant="caption" color="text.secondary">
            Step {step} of 3 — {step === 1 ? 'Customer Info' : step === 2 ? 'Select Products' : 'Review & Submit'}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small"><Close /></IconButton>
      </DialogTitle>

      {/* Step indicator */}
      <Box sx={{ px: 3, pb: 1 }}>
        <LinearProgress variant="determinate" value={(step / 3) * 100}
          sx={{ height: 4, borderRadius: 2, bgcolor: '#dcfce7', '& .MuiLinearProgress-bar': { bgcolor: '#16A34A' } }} />
      </Box>

      <DialogContent dividers sx={{ p: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {/* Step 1: Customer */}
        {step === 1 && (
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField fullWidth label="Customer Name *" value={customer.name}
                onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Phone Number" value={customer.phone}
                onChange={(e) => setCustomer((p) => ({ ...p, phone: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label="Payment Method" value={customer.paymentMethod}
                onChange={(e) => setCustomer((p) => ({ ...p, paymentMethod: e.target.value }))}>
                {['cash', 'check', 'bank_transfer', 'gcash', 'credit_term'].map((m) => (
                  <MenuItem key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Customer Address" value={customer.address} multiline rows={2}
                onChange={(e) => setCustomer((p) => ({ ...p, address: e.target.value }))} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Notes (optional)" value={customer.notes} multiline rows={2}
                onChange={(e) => setCustomer((p) => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        )}

        {/* Step 2: Products */}
        {step === 2 && (
          <Box>
            <TextField
              fullWidth size="small" placeholder="Search products..." value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
              sx={{ mb: 2 }}
            />
            {prodsLoading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={32} /></Box>
            ) : (
              <TableContainer sx={{ maxHeight: 260, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f0fdf4' }}>
                      {['Product', 'Stock', 'Price', ''].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#16A34A' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {availableProducts.length === 0 ? (
                      <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>No products found</TableCell></TableRow>
                    ) : availableProducts.slice(0, 40).map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.genericName || p.category || ''}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={p.stockLevel ?? 0} size="small"
                            color={(p.stockLevel ?? 0) <= 5 ? 'warning' : 'default'}
                            sx={{ fontSize: '0.68rem', height: 20 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{formatCurrency(p.price ?? p.sellingPrice ?? 0)}</TableCell>
                        <TableCell>
                          <Button size="small" variant="contained" onClick={() => addToCart(p)}
                            sx={{ bgcolor: '#16A34A', fontSize: '0.7rem', py: 0.3, px: 1.5, minWidth: 0, '&:hover': { bgcolor: '#15803d' } }}>
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Cart */}
            {cartItems.length > 0 && (
              <Box sx={{ border: '1px solid', borderColor: 'success.light', borderRadius: 2, p: 2, bgcolor: '#f0fdf4' }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: '#16A34A' }}>
                  Cart ({cartItems.length} item{cartItems.length !== 1 ? 's' : ''})
                </Typography>
                <Stack spacing={1}>
                  {cartItems.map((item) => (
                    <Box key={item.productId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }} noWrap>{item.productName}</Typography>
                      <TextField
                        size="small" type="number" value={item.quantity}
                        onChange={(e) => updateQty(item.productId, e.target.value)}
                        sx={{ width: 70 }} inputProps={{ min: 1 }}
                      />
                      <Typography variant="body2" fontWeight={700} sx={{ minWidth: 80, textAlign: 'right' }}>
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </Typography>
                      <IconButton size="small" color="error" onClick={() => removeFromCart(item.productId)}><Close fontSize="small" /></IconButton>
                    </Box>
                  ))}
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                  {/* Discount */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 68 }}>Discount</Typography>
                    <TextField
                      select size="small" value={discount.type}
                      onChange={(e) => setDiscount({ type: e.target.value, value: '' })}
                      sx={{ width: 120 }}
                    >
                      <MenuItem value="percent">% Percent</MenuItem>
                      <MenuItem value="fixed">₱ Fixed</MenuItem>
                    </TextField>
                    <TextField
                      size="small" type="number" value={discount.value}
                      onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))}
                      placeholder="0"
                      inputProps={{ min: 0, max: discount.type === 'percent' ? 100 : undefined, step: discount.type === 'percent' ? 1 : 0.01 }}
                      InputProps={{ startAdornment: <InputAdornment position="start">{discount.type === 'percent' ? '%' : '₱'}</InputAdornment> }}
                      sx={{ flex: 1 }}
                    />
                    {discountAmt > 0 && (
                      <Typography variant="body2" color="error.main" fontWeight={700} sx={{ minWidth: 72, textAlign: 'right' }}>
                        - {formatCurrency(discountAmt)}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">{discountAmt > 0 ? 'Total after discount' : 'Total'}</Typography>
                    <Typography variant="h6" fontWeight={800} color="success.main">{formatCurrency(finalTotal)}</Typography>
                  </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Box>
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              This sale will be submitted for <strong>manager approval</strong> before it is fulfilled. You'll be notified once approved.
            </Alert>
            <Card variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} color="success.main" sx={{ mb: 1 }}>Customer Details</Typography>
                <Grid container spacing={1}>
                  <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Name</Typography><Typography variant="body2" fontWeight={600}>{customer.name}</Typography></Grid>
                  <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Payment</Typography><Typography variant="body2" fontWeight={600}>{customer.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Typography></Grid>
                  {customer.phone && <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Phone</Typography><Typography variant="body2">{customer.phone}</Typography></Grid>}
                  {customer.address && <Grid size={{ xs: 12 }}><Typography variant="caption" color="text.secondary">Address</Typography><Typography variant="body2">{customer.address}</Typography></Grid>}
                </Grid>
              </CardContent>
            </Card>
            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small">
                <TableHead><TableRow sx={{ bgcolor: '#f0fdf4' }}>
                  {['Product', 'Qty', 'Unit Price', 'Total'].map((h) => <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#16A34A' }}>{h}</TableCell>)}
                </TableRow></TableHead>
                <TableBody>
                  {cartItems.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell><Typography variant="body2" fontWeight={600}>{item.productName}</Typography></TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{formatCurrency(item.quantity * item.unitPrice)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell colSpan={3} align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>Subtotal</TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{formatCurrency(cartTotal)}</TableCell>
                  </TableRow>
                  {discountAmt > 0 && (
                    <TableRow sx={{ bgcolor: '#fff7f7' }}>
                      <TableCell colSpan={3} align="right" sx={{ color: 'error.main', fontSize: '0.8rem' }}>
                        Discount {discount.type === 'percent' ? `(${discount.value}%)` : '(Fixed)'}
                      </TableCell>
                      <TableCell sx={{ color: 'error.main', fontSize: '0.85rem', fontWeight: 700 }}>- {formatCurrency(discountAmt)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={3} align="right" sx={{ fontWeight: 800, fontSize: '0.9rem' }}>TOTAL</TableCell>
                    <TableCell sx={{ fontWeight: 800, fontSize: '1rem', color: '#16A34A' }}>{formatCurrency(finalTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {step > 1 && (
          <Button variant="outlined" onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>
        )}
        <Box sx={{ flex: 1 }} />
        {step < 3 ? (
          <Button
            variant="contained"
            onClick={() => {
              if (step === 1 && !customer.name.trim()) { setError('Customer name is required'); return; }
              if (step === 2 && cartItems.length === 0) { setError('Add at least one product'); return; }
              setError(''); setStep((s) => s + 1);
            }}
            sx={{ bgcolor: '#16A34A', '&:hover': { bgcolor: '#15803d' } }}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <ReceiptLong />}
            sx={{ bgcolor: '#16A34A', '&:hover': { bgcolor: '#15803d' } }}
          >
            {saving ? 'Submitting...' : 'Submit for Approval'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Portal Page ───────────────────────────────────────────────────────────────────
export default function MedRepPortalPage() {
  const { user } = useAuth();
  const [mySales, setMySales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [repProfile, setRepProfile] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, COLLECTIONS.SALES_TRANSACTIONS),
      where('createdBy', '==', user.uid),
    );
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return tb - ta;
      });
      setMySales(docs);
      setLoading(false);
    }, (err) => {
      console.error('Sales query error:', err.message);
      setLoading(false);
    });
  }, [user?.uid]);

  // Subscribe to this rep's medical_reps profile (for quota)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, COLLECTIONS.MEDICAL_REPS),
      where('userId', '==', user.uid),
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) setRepProfile({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setRepProfile(null);
    });
  }, [user?.uid]);

  const stats = useMemo(() => {
    const total     = mySales.length;
    const pending   = mySales.filter((s) => s.status === 'pending_approval').length;
    const approved  = mySales.filter((s) => ['approved', 'completed', 'delivered'].includes(s.status)).length;
    const rejected  = mySales.filter((s) => ['rejected', 'cancelled'].includes(s.status)).length;
    const revenue   = mySales
      .filter((s) => ['approved', 'completed', 'delivered'].includes(s.status))
      .reduce((sum, s) => sum + (s.total || 0), 0);
    return { total, pending, approved, rejected, revenue };
  }, [mySales]);

  // Sales this calendar month (approved/completed only)
  const salesThisMonth = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return mySales
      .filter((s) => ['approved', 'completed', 'delivered'].includes(s.status))
      .filter((s) => {
        const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt || 0);
        return d >= monthStart;
      })
      .reduce((sum, s) => sum + (s.total || 0), 0);
  }, [mySales]);

  const repName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user?.email || 'Med Rep';

  return (
    <AppLayout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>

        {/* Header */}
        <Box sx={{
          background: 'linear-gradient(135deg, #0D1F15 0%, #134E26 55%, #16A34A 100%)',
          borderRadius: 3, p: { xs: 2.5, md: 3 }, mb: 3,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 52, height: 52, bgcolor: 'rgba(255,255,255,0.15)', fontSize: '1.3rem', fontWeight: 700 }}>
              {repName[0]?.toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.55)', letterSpacing: 2, fontSize: '0.62rem' }}>
                Med Rep Portal
              </Typography>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 800, lineHeight: 1.2 }}>
                {repName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
                {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setNewSaleOpen(true)}
            sx={{
              bgcolor: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              fontWeight: 700, borderRadius: 2,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            }}
          >
            Record New Sale
          </Button>
        </Box>

        {/* Stats */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <MetricCard label="Total Submitted" value={stats.total} icon={<ReceiptLong sx={{ fontSize: 20 }} />} color="#0891B2" />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <MetricCard label="Pending Approval" value={stats.pending} icon={<HourglassTop sx={{ fontSize: 20 }} />} color="#F59E0B" />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <MetricCard label="Approved" value={stats.approved} icon={<CheckCircle sx={{ fontSize: 20 }} />} color="#16A34A" />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <MetricCard label="Approved Revenue" value={formatCurrency(stats.revenue)} icon={<AttachMoney sx={{ fontSize: 20 }} />} color="#6366F1" />
          </Grid>
        </Grid>

        {/* Pending alert */}
        {stats.pending > 0 && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
            You have <strong>{stats.pending} sale{stats.pending > 1 ? 's' : ''}</strong> awaiting manager approval.
          </Alert>
        )}

        {/* Monthly Quota Card */}
        {repProfile && repProfile.quotaMonthly > 0 && (() => {
          const quota = repProfile.quotaMonthly;
          const pct   = Math.min(100, (salesThisMonth / quota) * 100);
          const met   = salesThisMonth >= quota;
          const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
          return (
            <Card sx={{ borderRadius: 3, mb: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: met ? '1.5px solid #16A34A' : '1px solid', borderColor: met ? 'success.main' : 'divider' }}>
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1, fontSize: '0.62rem' }}>
                      Monthly Sales Quota — {monthName}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
                      <Typography variant="h5" fontWeight={800} color={met ? 'success.main' : 'text.primary'}>
                        {formatCurrency(salesThisMonth)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">/ {formatCurrency(quota)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{
                    minWidth: 56, height: 56, borderRadius: '50%',
                    border: `3px solid ${met ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Typography variant="body2" fontWeight={800} color={met ? 'success.main' : pct >= 50 ? 'warning.main' : 'error.main'}>
                      {Math.round(pct)}%
                    </Typography>
                  </Box>
                </Box>
                <LinearProgress
                  variant="determinate" value={pct}
                  sx={{ height: 8, borderRadius: 4, mb: 0.75 }}
                  color={met ? 'success' : pct >= 50 ? 'warning' : 'error'}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">
                    {met
                      ? '🎉 Quota achieved! Great work.'
                      : `${formatCurrency(quota - salesThisMonth)} remaining to hit target`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {repProfile.status && (
                      <Chip label={repProfile.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        size="small" variant="outlined"
                        sx={{ height: 18, fontSize: '0.6rem', textTransform: 'capitalize' }} />
                    )}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          );
        })()}

        {/* Sales Table */}
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>My Sales</Typography>
              <Typography variant="caption" color="text.secondary">All sales you have submitted</Typography>
            </Box>
            <Chip label={`${mySales.length} total`} size="small" variant="outlined" />
          </Box>
          {loading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={32} /></Box>
          ) : mySales.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <ReceiptLong sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" fontWeight={600}>No sales yet</Typography>
              <Typography variant="caption" color="text.disabled">Click "Record New Sale" to get started</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f0fdf4' }}>
                    {['TXN #', 'Customer', 'Products', 'Amount', 'Payment', 'Status', 'Date', ''].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#16A34A', py: 1.5 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mySales.map((sale) => (
                    <TableRow key={sale.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          #{sale.transactionNumber || sale.id?.slice(-6).toUpperCase()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{sale.customerName || '—'}</Typography>
                        {sale.customerPhone && <Typography variant="caption" color="text.secondary">{sale.customerPhone}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{(sale.items || []).length} item{(sale.items || []).length !== 1 ? 's' : ''}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {(sale.items || []).slice(0, 2).map((i) => i.productName).join(', ')}
                          {(sale.items || []).length > 2 ? '…' : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} color="success.main">{formatCurrency(sale.total)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                          {(sale.paymentMethod || '').replace(/_/g, ' ')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABEL[sale.status] || sale.status || 'Unknown'}
                          color={STATUS_COLOR[sale.status] || 'default'}
                          size="small"
                          sx={{ fontSize: '0.68rem', fontWeight: 700, height: 22 }}
                        />
                        {sale.status === 'rejected' && sale.rejectionReason && (
                          <Typography variant="caption" display="block" color="error.main" sx={{ mt: 0.25, fontStyle: 'italic' }}>
                            {sale.rejectionReason}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {sale.createdAt ? formatDateTime(sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt)) : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {['approved', 'completed'].includes(sale.status) && (
                          <IconButton size="small" onClick={() => printSaleReceipt(sale)} title="Print Receipt">
                            <Print fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      </Box>

      <NewSaleDialog
        open={newSaleOpen}
        onClose={() => setNewSaleOpen(false)}
        onSubmitted={() => {}}
        currentUser={user}
      />
    </AppLayout>
  );
}
