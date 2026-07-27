import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Divider,
  Stack, InputAdornment, Tooltip, Alert, CircularProgress, Tabs, Tab,
  LinearProgress, Avatar,
} from '@mui/material';
import {
  Add, Search, Visibility, FilterList, Edit, Person,
  Assignment, TrendingUp, CheckCircle, Warning, HourglassTop,
  ThumbUp, ThumbDown, Close, Phone, Email, ChevronRight,
} from '@mui/icons-material';
import AppLayout from '@/components/layout/AppLayout';
import useAuth from '@/hooks/useAuth';
import { subscribeToUsers, updateUser } from '@/services/user.service';
import { subscribeToProducts } from '@/services/product.service';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc,
  serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';
import { logActivity } from '@/services/activity.service';
import { approveSale, rejectSale } from '@/services/sales.service';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  active:      'success',
  field_work:  'info',
  on_leave:    'warning',
  on_training: 'primary',
  inactive:    'default',
  suspended:   'error',
};
const STATUS_LABEL = {
  active:      'Active',
  field_work:  'Field Work',
  on_leave:    'On Leave',
  on_training: 'On Training',
  inactive:    'Inactive',
  suspended:   'Suspended',
};
const STATUS_BAR_COLOR = {
  active:      '#16A34A',
  field_work:  '#0891B2',
  on_leave:    '#D97706',
  on_training: '#7C3AED',
  inactive:    '#94A3B8',
  suspended:   '#DC2626',
};
const REP_STATUSES = ['active', 'field_work', 'on_leave', 'on_training', 'inactive', 'suspended'];

function TabPanel({ value, index, children }) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function MedicalRepsPage() {
  const { user, isMedRepManager } = useAuth();
  const isManager = isMedRepManager?.();
  const [tab, setTab]         = useState(0);
  const [reps, setReps]       = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState(''); 
  const [statusFilter, setStatus] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [viewRep, setViewRep] = useState(null);
  const [assignOpen, setAssignOpen] = useState(null);
  const [salesOpen, setSalesOpen]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');
  const [users, setUsers] = useState([]);

  // Roster management
  const [rosterDialogOpen, setRosterDialogOpen] = useState(false);
  const [rosterSaving, setRosterSaving] = useState(null); // repId being saved

  // Quota assignment
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [quotaRep, setQuotaRep] = useState(null);
  const [quotaValue, setQuotaValue] = useState('');

  // Pending approvals (from sales_transactions)
  const [pendingSales, setPendingSales] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [approvedSales, setApprovedSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approving, setApproving] = useState(null);
  const [saleDetailOpen, setSaleDetailOpen] = useState(null);



  const managerUsers = users.filter((u) => ['super_admin', 'ceo', 'admin', 'med_rep_manager'].includes(u.role));
  const salesRepUsers = users.filter((u) => u.role === 'sales_rep');

  const [form, setForm] = useState({
    name: '', phone: '', email: '', territory: '', address: '',
    status: 'active', quotaMonthly: 0, notes: '',
    managerId: '', userId: '',
  });
  const [assignForm, setAssignForm] = useState({ productId: '', productName: '', unitPrice: 0, quantity: 0, lotNumber: '', batchNumber: '', territory: '', notes: '' });
  const [salesForm, setSalesForm]   = useState({ customerName: '', productName: '', quantity: 0, unitPrice: 0, notes: '' });

  useEffect(() => {
    const q1 = query(collection(db, COLLECTIONS.MEDICAL_REPS), orderBy('createdAt', 'desc'));
    const q2 = query(collection(db, COLLECTIONS.REP_ASSIGNMENTS), orderBy('createdAt', 'desc'));
    const unsub1 = onSnapshot(q1, (snap) => {
      setReps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsub2 = onSnapshot(q2, (snap) => {
      setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsub3 = subscribeToUsers(setUsers);

    // Pending approval sales from med reps
    const qPending = query(
      collection(db, COLLECTIONS.SALES_TRANSACTIONS),
      where('status', '==', 'pending_approval'),
    );
    const unsub4 = onSnapshot(qPending, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return tb - ta;
      });
      setPendingSales(docs);
      setPendingLoading(false);
    });

    // All approved/completed sales for rep performance stats
    const qRepSales = query(
      collection(db, COLLECTIONS.SALES_TRANSACTIONS),
      where('status', 'in', ['approved', 'completed']),
    );
    const unsub5 = onSnapshot(qRepSales, (snap) => {
      setApprovedSales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsub6 = subscribeToProducts(setProducts);

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); };
  }, []);

  const filteredReps = reps.filter((r) => {
    // Managers only see reps on their own roster
    if (isManager && r.managerId !== user?.uid) return false;
    const matchSearch = !search ||
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.territory?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = reps.filter((r) => r.status === 'active').length;
  const totalSales  = assignments.filter((a) => a.type === 'sale').reduce((s, a) => s + (a.totalAmount || 0), 0);
  const totalAssigned = assignments.filter((a) => a.type === 'stock').reduce((s, a) => s + (a.quantity || 0), 0);

  const resetForm = () => {
    setForm({ name: '', phone: '', email: '', territory: '', address: '', status: 'active', quotaMonthly: 0, notes: '', managerId: '', userId: '' });
    setSaveError('');
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { setSaveError('Rep name is required'); return; }
    setSaveError(''); setSaving(true);
    try {
      const repRef = await addDoc(collection(db, COLLECTIONS.MEDICAL_REPS), {
        name:          form.name.trim(),
        phone:         form.phone.trim(),
        email:         form.email.trim(),
        territory:     form.territory.trim(),
        address:       form.address.trim(),
        status:        form.status,
        quotaMonthly:  Number(form.quotaMonthly),
        salesThisMonth: 0,
        notes:         form.notes.trim(),
        managerId:     form.managerId || '',
        userId:        form.userId || '',
        createdBy:     user?.uid || '',
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });
      // Link the system account to this rep and propagate managerId
      if (form.userId) {
        await updateUser(form.userId, {
          managerId: form.managerId || '',
          repId:     repRef.id,
        });
      }
      await logActivity({ type: 'med_rep_added', description: `Medical rep ${form.name} added`, userId: user?.uid });
      setAddOpen(false); resetForm();
    } catch (e) { setSaveError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleAssign = async () => {
    if (!assignForm.productName.trim() || !assignForm.quantity) return;
    setSaving(true);
    try {
      await addDoc(collection(db, COLLECTIONS.REP_ASSIGNMENTS), {
        repId:        assignOpen.id,
        repName:      assignOpen.name,
        type:         'stock',
        productId:    assignForm.productId || '',
        productName:  assignForm.productName.trim(),
        unitPrice:    Number(assignForm.unitPrice || 0),
        quantity:     Number(assignForm.quantity),
        lotNumber:    assignForm.lotNumber.trim(),
        batchNumber:  assignForm.batchNumber.trim(),
        territory:    assignForm.territory.trim() || assignOpen.territory,
        notes:        assignForm.notes.trim(),
        status:       'active',
        createdBy:    user?.uid || '',
        createdAt:    serverTimestamp(),
      });
      await logActivity({ type: 'stock_assigned', description: `${assignForm.quantity} units of ${assignForm.productName} assigned to ${assignOpen.name}`, userId: user?.uid });
      setAssignOpen(null); setAssignForm({ productId: '', productName: '', unitPrice: 0, quantity: 0, lotNumber: '', batchNumber: '', territory: '', notes: '' });
    } catch (e) { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleEncodeSale = async () => {
    if (!salesForm.customerName.trim() || !salesForm.productName.trim()) return;
    const totalAmount = Number(salesForm.quantity) * Number(salesForm.unitPrice);
    setSaving(true);
    try {
      await addDoc(collection(db, COLLECTIONS.REP_ASSIGNMENTS), {
        repId:        salesOpen.id,
        repName:      salesOpen.name,
        type:         'sale',
        customerName: salesForm.customerName.trim(),
        productName:  salesForm.productName.trim(),
        quantity:     Number(salesForm.quantity),
        unitPrice:    Number(salesForm.unitPrice),
        totalAmount,
        notes:        salesForm.notes.trim(),
        status:       'encoded',
        createdBy:    user?.uid || '',
        createdAt:    serverTimestamp(),
      });
      // update monthly sales on rep doc
      const repDoc = doc(db, COLLECTIONS.MEDICAL_REPS, salesOpen.id);
      await updateDoc(repDoc, {
        salesThisMonth: (salesOpen.salesThisMonth || 0) + totalAmount,
        updatedAt:      serverTimestamp(),
      });
      await logActivity({ type: 'rep_sale_encoded', description: `Sale of ${formatCurrency(totalAmount)} encoded for ${salesOpen.name}`, userId: user?.uid });
      setSalesOpen(null); setSalesForm({ customerName: '', productName: '', quantity: 0, unitPrice: 0, notes: '' });
    } catch (e) { /* ignore */ }
    finally { setSaving(false); }
  };

  // Rep performance map: createdBy uid → { count, revenue }
  const repPerformance = useMemo(() => {
    const map = {};
    pendingSales.forEach((s) => {
      if (!map[s.createdBy]) map[s.createdBy] = { pending: 0, total: 0 };
      map[s.createdBy].pending += 1;
    });
    return map;
  }, [pendingSales]);

  // My roster (reps assigned to current manager)
  const myReps = useMemo(() =>
    reps.filter((r) => r.managerId === user?.uid)
  , [reps, user?.uid]);

  // UIDs of the current manager's reps (for filtering pending sales)
  // Include both: reps with managerId set on the rep doc, AND sales_rep users with managerId set on their user doc
  const myRepUserIds = useMemo(() => {
    const fromRepDocs = myReps.map((r) => r.userId).filter(Boolean);
    const fromUserDocs = salesRepUsers
      .filter((u) => u.managerId === user?.uid)
      .map((u) => u.id);
    return [...new Set([...fromRepDocs, ...fromUserDocs])];
  }, [myReps, salesRepUsers, user?.uid]);

  // Dialog source: sales_rep users NOT already on this manager's roster
  // Use myReps (the actual medical_reps docs) as source of truth, not the managerId field on the user doc
  const unassignedRepUsers = useMemo(() => {
    const alreadyInRoster = new Set(myReps.map((r) => r.userId).filter(Boolean));
    return salesRepUsers.filter((u) => !alreadyInRoster.has(u.id));
  }, [salesRepUsers, myReps]);

  // Admin view: reps not assigned to ANY manager (globally unassigned)
  const adminUnassignedRepUsers = useMemo(() => {
    const assignedUserIds = new Set(
      reps.filter((r) => r.managerId).map((r) => r.userId).filter(Boolean)
    );
    return salesRepUsers.filter((u) => !assignedUserIds.has(u.id) && !u.managerId);
  }, [salesRepUsers, reps]);

  // Lookup map: userId → medical_reps doc (for linking)
  const repByUserId = useMemo(() => {
    const map = {};
    reps.forEach((r) => { if (r.userId) map[r.userId] = r; });
    return map;
  }, [reps]);

  // Pending sales filtered to manager's own reps (admins see all)
  const visiblePendingSales = useMemo(() =>
    isManager
      ? pendingSales.filter((s) => myRepUserIds.includes(s.createdBy))
      : pendingSales
  , [isManager, pendingSales, myRepUserIds]);

  // Pending count per rep userId (for roster stats)
  const pendingByRepUserId = useMemo(() => {
    const map = {};
    pendingSales.forEach((s) => {
      map[s.createdBy] = (map[s.createdBy] || 0) + 1;
    });
    return map;
  }, [pendingSales]);

  // Approved/completed sales stats per rep userId
  const salesStatsByRepUserId = useMemo(() => {
    const map = {};
    approvedSales.forEach((s) => {
      const uid = s.createdBy;
      if (!uid) return;
      if (!map[uid]) map[uid] = { count: 0, total: 0 };
      map[uid].count += 1;
      map[uid].total += Number(s.total || s.amount || 0);
    });
    return map;
  }, [approvedSales]);

  // Grand total revenue across all approved sales
  const totalApprovedRevenue = useMemo(() =>
    Object.values(salesStatsByRepUserId).reduce((s, v) => s + v.total, 0)
  , [salesStatsByRepUserId]);

  // This-month sales per rep userId (for quota progress)
  const salesThisMonthByRepUserId = useMemo(() => {
    const map = {};
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    approvedSales.forEach((s) => {
      const uid = s.createdBy;
      if (!uid) return;
      const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt || 0);
      if (d >= monthStart) map[uid] = (map[uid] || 0) + Number(s.total || 0);
    });
    return map;
  }, [approvedSales]);

  // Total revenue across all my roster reps
  const rosterTotalRevenue = useMemo(() =>
    myReps.reduce((sum, r) => sum + (salesStatsByRepUserId[r.userId]?.total || 0), 0)
  , [myReps, salesStatsByRepUserId]);

  const handleAssignToRoster = async (repUser) => {
    // repUser is a users doc with role 'sales_rep'
    setRosterSaving(repUser.id);
    try {
      // 1. Set managerId on the user doc
      await updateUser(repUser.id, { managerId: user.uid });

      // 2. Find the linked medical_reps doc and update its managerId
      const repDoc = repByUserId[repUser.id]
        || reps.find((r) => r.id === repUser.repId);

      if (repDoc) {
        await updateDoc(doc(db, COLLECTIONS.MEDICAL_REPS, repDoc.id), {
          managerId:  user.uid,
          userId:     repUser.id,
          updatedAt:  serverTimestamp(),
        });
      } else {
        // Fallback: create a rep profile if somehow none exists
        const displayName = `${repUser.firstName || ''} ${repUser.lastName || ''}`.trim() || repUser.username || 'Unknown';
        const newRepRef = await addDoc(collection(db, COLLECTIONS.MEDICAL_REPS), {
          name:          displayName,
          phone:         repUser.phone || '',
          email:         repUser.email || '',
          territory:     '',
          address:       '',
          status:        'active',
          quotaMonthly:  0,
          salesThisMonth: 0,
          notes:         '',
          managerId:     user.uid,
          userId:        repUser.id,
          createdAt:     serverTimestamp(),
          updatedAt:     serverTimestamp(),
        });
        await updateUser(repUser.id, { repId: newRepRef.id });
      }

      const name = `${repUser.firstName || ''} ${repUser.lastName || ''}`.trim() || repUser.username;
      await logActivity({ type: 'roster_assigned', description: `${name} added to roster`, userId: user?.uid });
      toast.success(`${name} added to your roster!`);
    } catch (e) { toast.error(e.message || 'Failed to assign'); }
    finally { setRosterSaving(null); }
  };

  const handleRemoveFromRoster = async (rep) => {
    // rep is a medical_reps doc
    setRosterSaving(rep.id);
    try {
      await updateDoc(doc(db, COLLECTIONS.MEDICAL_REPS, rep.id), { managerId: '', updatedAt: serverTimestamp() });
      if (rep.userId) await updateUser(rep.userId, { managerId: '' });
      await logActivity({ type: 'roster_removed', description: `${rep.name} removed from manager ${user.uid} roster`, userId: user?.uid });
      toast.success(`${rep.name} removed from your roster.`);
    } catch (e) { toast.error(e.message || 'Failed to remove'); }
    finally { setRosterSaving(null); }
  };

  const handleSetQuota = async () => {
    if (!quotaRep) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.MEDICAL_REPS, quotaRep.id), {
        quotaMonthly: Number(quotaValue) || 0,
        updatedAt:    serverTimestamp(),
      });
      await logActivity({ type: 'quota_set', description: `Monthly quota set to ${formatCurrency(Number(quotaValue) || 0)} for ${quotaRep.name}`, userId: user?.uid });
      toast.success(`Quota updated for ${quotaRep.name}`);
      setQuotaDialogOpen(false);
    } catch (e) { toast.error(e.message || 'Failed to update quota'); }
    finally { setSaving(false); }
  };

  const handleApproveSale = async (saleId) => {
    setApproving(saleId);
    try {
      await approveSale(saleId, user?.uid, 'Approved by manager');
      await logActivity({ type: 'sale_approved', description: `Sale ${saleId} approved`, userId: user?.uid });
      toast.success?.('Sale approved!');
    } catch (e) {
      toast.error?.(e.message || 'Failed to approve');
    } finally { setApproving(null); }
  };

  const handleRejectSale = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setApproving(rejectTarget.id);
    try {
      await rejectSale(rejectTarget.id, user?.uid, rejectReason.trim());
      await logActivity({ type: 'sale_rejected', description: `Sale ${rejectTarget.id} rejected: ${rejectReason}`, userId: user?.uid });
      setRejectTarget(null); setRejectReason('');
    } catch (e) {
      toast.error?.(e.message || 'Failed to reject');
    } finally { setApproving(null); }
  };

  const repSales = (repId) => assignments.filter((a) => a.repId === repId && a.type === 'sale');
  const repStock = (repId) => assignments.filter((a) => a.repId === repId && a.type === 'stock');

  return (
    <AppLayout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>Medical Representatives</Typography>
            <Typography variant="body2" color="text.secondary">
              {isManager
                ? `Your Roster: ${myReps.length} rep${myReps.length !== 1 ? 's' : ''} assigned to you`
                : 'Territory management, assigned stock monitoring, and performance tracking'}
            </Typography>
          </Box>

        </Box>

        {/* KPI Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Reps',       value: reps.length,     icon: <Person />,     color: 'primary.main' },
            { label: 'Active',           value: activeCount,     icon: <CheckCircle />, color: 'success.main' },
            { label: 'Total Sales',      value: formatCurrency(totalApprovedRevenue), icon: <TrendingUp />, color: 'warning.main' },
            { label: 'Units Assigned',   value: totalAssigned,   icon: <Assignment />,  color: 'info.main' },
          ].map((kpi) => (
            <Grid item xs={6} md={3} key={kpi.label}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
                      <Typography variant="h5" fontWeight={700} sx={{ color: kpi.color }}>{kpi.value}</Typography>
                    </Box>
                    <Box sx={{ color: kpi.color, opacity: 0.7 }}>{kpi.icon}</Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Tabs */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Representatives" />
          <Tab label="Assigned Stock" />
          <Tab label="Encoded Sales" />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                Pending Approvals
                {visiblePendingSales.length > 0 && (
                  <Chip label={visiblePendingSales.length} size="small" color="warning"
                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                )}
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {isManager ? 'My Roster' : 'Team Rosters'}
                {isManager
                  ? myReps.length > 0 && (
                      <Chip label={myReps.length} size="small" color="primary"
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                    )
                  : managerUsers.filter((m) => m.role === 'med_rep_manager').length > 0 && (
                      <Chip label={managerUsers.filter((m) => m.role === 'med_rep_manager').length}
                        size="small" color="success"
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                    )
                }
              </Box>
            }
          />
        </Tabs>

        {/* ── Tab 0: Representatives ───────────────────────────────────── */}
        <TabPanel value={tab} index={0}>
          {/* Filters */}
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
            <CardContent sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} alignItems="center">
                <FilterList fontSize="small" color="action" />
                <TextField size="small" placeholder="Search rep or territory" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                  sx={{ minWidth: 240 }} />
                <TextField select size="small" label="Status" value={statusFilter}
                  onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 130 }}>
                  <MenuItem value="all">All</MenuItem>
                  {REP_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>{STATUS_LABEL[s] || s}</MenuItem>
                  ))}
                </TextField>
              </Stack>
            </CardContent>
          </Card>

          <Grid container spacing={2}>
            {loading ? (
              <Grid item xs={12} sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} /></Grid>
            ) : filteredReps.length === 0 ? (
              <Grid item xs={12} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                {isManager ? 'No reps on your roster yet. Go to My Roster tab to add reps.' : 'No medical reps found'}
              </Grid>
            ) : filteredReps.map((rep) => {
              const quota = rep.quotaMonthly || 0;
              const sales = salesThisMonthByRepUserId[rep.userId] || 0;
              const pct   = quota > 0 ? Math.min(100, (sales / quota) * 100) : 0;
              return (
                <Grid item xs={12} sm={6} md={4} key={rep.id}>
                  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
                          {rep.name?.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography fontWeight={700}>{rep.name}</Typography>
                          <Chip label={STATUS_LABEL[rep.status] || rep.status} size="small" color={STATUS_COLOR[rep.status] || 'default'} />
                        </Box>
                      </Box>
                      <Typography variant="caption" color="text.secondary">Territory: </Typography>
                      <Typography variant="body2" component="span">{rep.territory || '—'}</Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary">Phone: </Typography>
                      <Typography variant="body2" component="span">{rep.phone || '—'}</Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary">Manager: </Typography>
                      <Typography variant="body2" component="span">
                        {rep.managerId
                          ? (managerUsers.find((u) => u.id === rep.managerId)
                              ? `${managerUsers.find((u) => u.id === rep.managerId).firstName || ''} ${managerUsers.find((u) => u.id === rep.managerId).lastName || ''}`.trim() || 'Assigned'
                              : 'Assigned')
                          : <em style={{ color: '#aaa' }}>Unassigned</em>}
                      </Typography>

                      {quota > 0 && (
                        <Box sx={{ mt: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">Monthly Quota</Typography>
                            <Typography variant="caption" fontWeight={700}>
                              {formatCurrency(sales)} / {formatCurrency(quota)}
                            </Typography>
                          </Box>
                          <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }}
                            color={pct >= 100 ? 'success' : pct >= 50 ? 'warning' : 'error'} />
                        </Box>
                      )}

                      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                        <Button size="small" variant="outlined" startIcon={<Visibility />} onClick={() => setViewRep(rep)}>
                          View
                        </Button>
                        <Button size="small" variant="outlined" color="info" startIcon={<Assignment />}
                          onClick={() => { setAssignOpen(rep); setAssignForm({ productId: '', productName: '', unitPrice: 0, quantity: 0, lotNumber: '', batchNumber: '', territory: rep.territory || '', notes: '' }); }}>
                          Assign
                        </Button>
                        <Button size="small" variant="outlined" color="success" startIcon={<TrendingUp />}
                          onClick={() => { setSalesOpen(rep); setSalesForm({ customerName: '', productName: '', quantity: 0, unitPrice: 0, notes: '' }); }}>
                          Sale
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </TabPanel>

        {/* ── Tab 1: Assigned Stock ────────────────────────────────────── */}
        <TabPanel value={tab} index={1}>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Rep</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell>Batch #</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell>Territory</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.filter((a) => a.type === 'stock').length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No stock assignments yet</TableCell></TableRow>
                ) : assignments.filter((a) => a.type === 'stock').map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{a.repName}</Typography></TableCell>
                    <TableCell>{a.productName}</TableCell>
                    <TableCell><Typography variant="caption">{a.batchNumber || '—'}</Typography></TableCell>
                    <TableCell align="right">{a.quantity}</TableCell>
                    <TableCell>{a.territory || '—'}</TableCell>
                    <TableCell><Typography variant="caption">{a.createdAt ? formatDate(a.createdAt) : '—'}</Typography></TableCell>
                    <TableCell><Chip label={a.status || 'active'} size="small" color="success" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* ── Tab 2: Encoded Sales ─────────────────────────────────────── */}
        <TabPanel value={tab} index={2}>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                  <TableCell>Rep</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Unit Price</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.filter((a) => a.type === 'sale').length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No sales encoded yet</TableCell></TableRow>
                ) : assignments.filter((a) => a.type === 'sale').map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{a.repName}</Typography></TableCell>
                    <TableCell>{a.customerName}</TableCell>
                    <TableCell>{a.productName}</TableCell>
                    <TableCell align="right">{a.quantity}</TableCell>
                    <TableCell align="right">{formatCurrency(a.unitPrice || 0)}</TableCell>
                    <TableCell align="right"><Typography fontWeight={700} color="success.main">{formatCurrency(a.totalAmount || 0)}</Typography></TableCell>
                    <TableCell><Typography variant="caption">{a.createdAt ? formatDate(a.createdAt) : '—'}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* ── Tab 3: Pending Approvals ─────────────────────────────────── */}
        <TabPanel value={tab} index={3}>
          {pendingLoading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={32} /></Box>
          ) : visiblePendingSales.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <CheckCircle sx={{ fontSize: 52, color: 'success.light', mb: 1 }} />
              <Typography fontWeight={700} color="text.secondary">No pending approvals</Typography>
              <Typography variant="caption" color="text.disabled">All med rep sales have been reviewed</Typography>
            </Box>
          ) : (
            <>
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                <strong>{visiblePendingSales.length} sale{visiblePendingSales.length > 1 ? 's' : ''}</strong> submitted by med reps{isManager ? ' on your team' : ''} are waiting for your approval.
              </Alert>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'warning.light', borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#fffbeb' }}>
                      {['TXN #', 'Rep', 'Customer', 'Products', 'Amount', 'Payment', 'Submitted', 'Actions'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#92400e' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visiblePendingSales.map((sale) => {
                      const repUser = users.find((u) => u.id === sale.createdBy);
                      const repName = sale.submittedByName ||
                        (repUser ? `${repUser.firstName || ''} ${repUser.lastName || ''}`.trim() || repUser.username : 'Unknown Rep');
                      return (
                        <TableRow key={sale.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                              #{sale.transactionNumber || sale.id?.slice(-6).toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.75rem' }}>
                                {repName[0]?.toUpperCase()}
                              </Avatar>
                              <Typography variant="body2" fontWeight={600}>{repName}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{sale.customerName || '—'}</Typography>
                            {sale.customerPhone && <Typography variant="caption" color="text.secondary">{sale.customerPhone}</Typography>}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{(sale.items || []).length} item{(sale.items || []).length !== 1 ? 's' : ''}</Typography>
                            <Tooltip title={(sale.items || []).map((i) => `${i.productName} ×${i.quantity}`).join(', ')}>
                              <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', textDecoration: 'underline dotted' }} noWrap>
                                {(sale.items || []).slice(0, 2).map((i) => i.productName).join(', ')}{(sale.items || []).length > 2 ? '…' : ''}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={800} color="success.main">{formatCurrency(sale.total)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                              {(sale.paymentMethod || '').replace(/_/g, ' ')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {sale.createdAt ? formatDateTime(sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt)) : '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="View Details">
                                <IconButton size="small" color="info"
                                  onClick={() => setSaleDetailOpen({ ...sale, _repName: repName })}>
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Approve Sale">
                                <span>
                                  <IconButton size="small" color="success"
                                    disabled={approving === sale.id}
                                    onClick={() => handleApproveSale(sale.id)}>
                                    {approving === sale.id ? <CircularProgress size={16} /> : <ThumbUp fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Reject Sale">
                                <IconButton size="small" color="error"
                                  disabled={!!approving}
                                  onClick={() => { setRejectTarget({ id: sale.id, name: sale.customerName }); setRejectReason(''); }}>
                                  <ThumbDown fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </TabPanel>

        {/* ── Tab 4: My Roster ──────────────────────────────────────────── */}
        <TabPanel value={tab} index={4}>
          {isManager ? (
            <Box>
              {/* Roster stats */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { label: 'My Reps',           value: myReps.length,               color: '#16A34A', isCurrency: false },
                  { label: 'Pending Approvals',  value: visiblePendingSales.length,  color: '#F59E0B', isCurrency: false },
                  { label: 'Total Revenue',      value: rosterTotalRevenue,          color: '#0891B2', isCurrency: true  },
                ].map((s) => (
                  <Grid item xs={6} sm={4} key={s.label}>
                    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, textAlign: 'center', p: 2 }}>
                      <Typography variant="h5" fontWeight={800} sx={{ color: s.color }}>
                        {s.isCurrency ? formatCurrency(s.value) : s.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  My Team ({myReps.length} rep{myReps.length !== 1 ? 's' : ''})
                </Typography>
                <Button variant="outlined" startIcon={<Add />} size="small"
                  disabled={unassignedRepUsers.length === 0}
                  onClick={() => setRosterDialogOpen(true)}>
                  Add Rep to Roster
                </Button>
              </Box>

              {myReps.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 3 }}>
                  <Person sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
                  <Typography fontWeight={700} color="text.secondary">Your roster is empty</Typography>
                  <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 2 }}>Add med reps to your team to track their sales</Typography>
                  <Button variant="contained" startIcon={<Add />} disabled={unassignedRepUsers.length === 0}
                    onClick={() => setRosterDialogOpen(true)}
                    sx={{ bgcolor: '#16A34A', '&:hover': { bgcolor: '#15803d' } }}>
                    Add Rep to Roster
                  </Button>
                </Box>
              ) : (
                <Stack spacing={1.5}>
                  {myReps.map((rep) => {
                    const quota        = rep.quotaMonthly || 0;
                    const salesThisMo  = rep.salesThisMonth || 0;
                    const pct          = quota > 0 ? Math.min(100, (salesThisMo / quota) * 100) : 0;
                    const pending      = pendingByRepUserId[rep.userId] || 0;
                    const stats        = salesStatsByRepUserId[rep.userId] || { count: 0, total: 0 };
                    return (
                      <Card key={rep.id} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                            <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44, fontWeight: 700 }}>
                              {rep.name?.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                              {/* Header row */}
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                  <Typography fontWeight={700}>{rep.name}</Typography>
                                  <Chip label={STATUS_LABEL[rep.status] || rep.status} size="small" color={STATUS_COLOR[rep.status] || 'default'} sx={{ height: 20, fontSize: '0.65rem' }} />
                                  {pending > 0 && (
                                    <Chip label={`${pending} pending`} size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                                  )}
                                </Box>
                                <Stack direction="row" spacing={0.75}>
                                  <Button size="small" variant="outlined" color="primary" sx={{ fontSize: '0.7rem', py: 0.3 }}
                                    onClick={() => { setQuotaRep(rep); setQuotaValue(rep.quotaMonthly || ''); setQuotaDialogOpen(true); }}>
                                    Set Quota
                                  </Button>
                                  <Button size="small" variant="outlined" color="error" sx={{ fontSize: '0.7rem', py: 0.3 }}
                                    disabled={rosterSaving === rep.id}
                                    onClick={() => handleRemoveFromRoster(rep)}>
                                    {rosterSaving === rep.id ? 'Removing…' : 'Remove'}
                                  </Button>
                                </Stack>
                              </Box>

                              {/* Contact info */}
                              <Stack direction="row" spacing={2} sx={{ mt: 0.75 }} flexWrap="wrap">
                                <Typography variant="caption" color="text.secondary">📍 {rep.territory || '—'}</Typography>
                                <Typography variant="caption" color="text.secondary">📞 {rep.phone || '—'}</Typography>
                                {rep.email && <Typography variant="caption" color="text.secondary">✉ {rep.email}</Typography>}
                              </Stack>

                              {/* Sales stats */}
                              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 1.25,
                                p: 1.25, bgcolor: 'grey.50', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                                <Box sx={{ textAlign: 'center' }}>
                                  <Typography variant="caption" color="text.secondary" display="block">Total Sales</Typography>
                                  <Typography variant="body2" fontWeight={700} color="primary.main">{stats.count}</Typography>
                                </Box>
                                <Box sx={{ textAlign: 'center', borderLeft: '1px solid', borderRight: '1px solid', borderColor: 'divider' }}>
                                  <Typography variant="caption" color="text.secondary" display="block">Revenue</Typography>
                                  <Typography variant="body2" fontWeight={700} color="success.main" noWrap>{formatCurrency(stats.total)}</Typography>
                                </Box>
                                <Box sx={{ textAlign: 'center' }}>
                                  <Typography variant="caption" color="text.secondary" display="block">Pending</Typography>
                                  <Typography variant="body2" fontWeight={700} color={pending > 0 ? 'warning.main' : 'text.secondary'}>{pending}</Typography>
                                </Box>
                              </Box>

                              {/* Monthly quota progress */}
                              {quota > 0 && (
                                <Box sx={{ mt: 1 }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                                    <Typography variant="caption" color="text.secondary">Monthly Quota</Typography>
                                    <Typography variant="caption" fontWeight={700}>
                                      {formatCurrency(salesThisMo)} / {formatCurrency(quota)}
                                    </Typography>
                                  </Box>
                                  <LinearProgress variant="determinate" value={pct} sx={{ height: 5, borderRadius: 3 }}
                                    color={pct >= 100 ? 'success' : pct >= 50 ? 'warning' : 'error'} />
                                </Box>
                              )}
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              )}
            </Box>
          ) : (
            /* ADMIN VIEW — Meeting Roster Style */
            <Box>
              {/* Top summary bar */}
              <Box sx={{ display: 'flex', gap: 0, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                {[
                  { label: 'Total Reps',    value: reps.length,                                                                                  accent: '#2563EB' },
                  { label: 'Managers',      value: managerUsers.filter((m) => m.role === 'med_rep_manager').length,                               accent: '#7C3AED' },
                  { label: 'Assigned',      value: reps.filter((r) => r.managerId).length,                                                       accent: '#059669' },
                  { label: 'Total Revenue', value: formatCurrency(reps.reduce((s, r) => s + (salesStatsByRepUserId[r.userId]?.total || 0), 0)),   accent: '#0891B2' },
                ].map((s, i, arr) => (
                  <Box key={s.label} sx={{ flex: 1, py: 1.5, px: 2, textAlign: 'center',
                    borderLeft: i > 0 ? '1px solid' : 'none', borderColor: 'divider',
                    borderTop: `3px solid ${s.accent}` }}>
                    <Typography variant="h6" fontWeight={800} sx={{ color: s.accent, lineHeight: 1.2 }}>{s.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </Box>
                ))}
              </Box>

              {/* Legend — shown once */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="caption" color="text.disabled" sx={{ mr: 0.5 }}>Status:</Typography>
                {[
                  { label: 'Active',   color: '#16A34A' },
                  { label: 'On Leave', color: '#D97706' },
                  { label: 'Inactive', color: '#DC2626' },
                ].map((l) => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                    <Box sx={{ width: 20, height: 12, borderRadius: 0.5, bgcolor: l.color }} />
                    <Typography variant="caption" color="text.secondary">{l.label}</Typography>
                  </Box>
                ))}
              </Box>

              {managerUsers.filter((m) => m.role === 'med_rep_manager').length === 0 ? (
                <Alert severity="info">No med rep managers yet. Create a user with the "Med Rep Manager" role first.</Alert>
              ) : managerUsers.filter((m) => m.role === 'med_rep_manager').map((mgr) => {
                const mgrReps    = reps.filter((r) => r.managerId === mgr.id);
                const mgrRevenue = mgrReps.reduce((s, r) => s + (salesStatsByRepUserId[r.userId]?.total || 0), 0);
                const mgrPending = mgrReps.reduce((s, r) => s + (pendingByRepUserId[r.userId] || 0), 0);
                const mgrName    = `${mgr.firstName || ''} ${mgr.lastName || ''}`.trim() || mgr.username;
                return (
                  <Box key={mgr.id} sx={{ mb: 3.5 }}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                      <Table size="small">
                        {/* Manager header row */}
                        <TableHead>
                          <TableRow>
                            <TableCell colSpan={7} sx={{ py: 1.25, px: 2, bgcolor: '#F1F5F9', borderBottom: '2px solid', borderColor: '#E2E8F0' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                <Avatar sx={{ bgcolor: '#7C3AED', width: 34, height: 34, fontSize: '0.85rem', fontWeight: 700 }}>
                                  {mgr.firstName?.charAt(0) || mgr.username?.charAt(0) || 'M'}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight={700}>{mgrName}</Typography>
                                  <Typography variant="caption" color="text.secondary">{mgr.email || mgr.phone || 'Med Rep Manager'}</Typography>
                                </Box>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                  <Chip label={`${mgrReps.length} rep${mgrReps.length !== 1 ? 's' : ''}`} size="small"
                                    color={mgrReps.length > 0 ? 'success' : 'default'} sx={{ fontWeight: 700 }} />
                                  <Typography variant="caption" fontWeight={700} color="success.main">{formatCurrency(mgrRevenue)}</Typography>
                                  {mgrPending > 0 && (
                                    <Chip label={`${mgrPending} pending`} size="small" color="warning" sx={{ fontWeight: 700 }} />
                                  )}
                                </Stack>
                              </Box>
                            </TableCell>
                          </TableRow>
                          {/* Column headers */}
                          <TableRow sx={{ bgcolor: '#FAFAFA' }}>
                            <TableCell align="center" sx={{ fontWeight: 700, width: 52, color: 'text.secondary', fontSize: '0.72rem' }}>#</TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Person sx={{ fontSize: 15, color: 'text.secondary' }} /> Name
                              </Box>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', display: { xs: 'none', md: 'table-cell' } }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Assignment sx={{ fontSize: 15, color: 'text.secondary' }} /> Territory
                              </Box>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', display: { xs: 'none', sm: 'table-cell' } }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Phone sx={{ fontSize: 15, color: 'text.secondary' }} /> Phone
                              </Box>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', display: { xs: 'none', md: 'table-cell' } }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Email sx={{ fontSize: 15, color: 'text.secondary' }} /> E-mail
                              </Box>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TrendingUp sx={{ fontSize: 15, color: 'text.secondary' }} /> Status / Quota
                              </Box>
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', width: 72, color: 'text.secondary' }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mgrReps.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                No reps assigned to this manager yet
                              </TableCell>
                            </TableRow>
                          ) : mgrReps.map((rep, idx) => {
                            const quota       = rep.quotaMonthly || 0;
                            const salesThisMo = salesThisMonthByRepUserId[rep.userId] || 0;
                            const pct         = quota > 0 ? Math.min(100, (salesThisMo / quota) * 100) : 0;
                            const pending     = pendingByRepUserId[rep.userId] || 0;
                            const statusColor = STATUS_BAR_COLOR[rep.status] || '#94A3B8';
                            return (
                              <TableRow key={rep.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                {/* Row number */}
                                <TableCell align="center">
                                  <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#F1F5F9',
                                    border: '1.5px solid #CBD5E1', display: 'inline-flex',
                                    alignItems: 'center', justifyContent: 'center' }}>
                                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: '#475569', lineHeight: 1 }}>
                                      {String(idx + 1).padStart(2, '0')}
                                    </Typography>
                                  </Box>
                                </TableCell>

                                {/* Name */}
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <ChevronRight sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
                                    <Box>
                                      <Typography variant="body2" fontWeight={700}>{rep.name}</Typography>
                                      {pending > 0 && (
                                        <Chip label={`${pending} pending`} size="small" color="warning"
                                          sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700 }} />
                                      )}
                                    </Box>
                                  </Box>
                                </TableCell>

                                {/* Territory */}
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                                  <Typography variant="body2">{rep.territory || '—'}</Typography>
                                </TableCell>

                                {/* Phone */}
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                  <Typography variant="body2">{rep.phone || '—'}</Typography>
                                </TableCell>

                                {/* Email */}
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                                  <Typography variant="body2" color="primary.main"
                                    sx={{ textDecoration: 'underline', cursor: 'default', wordBreak: 'break-all' }}>
                                    {rep.email || '—'}
                                  </Typography>
                                </TableCell>

                                {/* Status bar + quota */}
                                <TableCell>
                                  <Box>
                                    <Box sx={{ height: 16, borderRadius: 0.75, bgcolor: statusColor,
                                      width: quota > 0 ? `${Math.max(pct, 8)}%` : '100%',
                                      minWidth: 28, maxWidth: 130, transition: 'width 0.4s ease', opacity: 0.85 }} />
                                    {quota > 0 && (
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                        {formatCurrency(salesThisMo)} / {formatCurrency(quota)} ({Math.round(pct)}%)
                                      </Typography>
                                    )}
                                  </Box>
                                </TableCell>

                                {/* Actions */}
                                <TableCell align="center">
                                  <Stack direction="row" spacing={0.25} justifyContent="center">
                                    <Tooltip title="Set Monthly Quota">
                                      <IconButton size="small" color="primary"
                                        onClick={() => { setQuotaRep(rep); setQuotaValue(rep.quotaMonthly || ''); setQuotaDialogOpen(true); }}>
                                        <Assignment sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove from roster">
                                      <span>
                                        <IconButton size="small" color="error" disabled={rosterSaving === rep.id}
                                          onClick={() => handleRemoveFromRoster(rep)}>
                                          {rosterSaving === rep.id ? <CircularProgress size={14} /> : <Close sx={{ fontSize: 16 }} />}
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                );
              })}

              {/* Unassigned reps */}
              {adminUnassignedRepUsers.length > 0 && (
                <Card elevation={0} sx={{ border: '1px dashed', borderColor: 'warning.light', borderRadius: 2 }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Warning sx={{ fontSize: 18, color: 'warning.main' }} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Unassigned Reps ({adminUnassignedRepUsers.length})
                      </Typography>
                    </Box>
                    <Stack direction="row" flexWrap="wrap" gap={0.75}>
                      {adminUnassignedRepUsers.map((u) => {
                        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username;
                        return <Chip key={u.id} label={name} size="small" variant="outlined" color="warning" />;
                      })}
                    </Stack>
                  </CardContent>
                </Card>
              )}
            </Box>
          )}
        </TabPanel>

        {/* ── Assign to Roster Dialog ───────────────────────────────────── */}
        <Dialog open={rosterDialogOpen} onClose={() => setRosterDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle fontWeight={700}>Add Reps to Your Roster</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            {unassignedRepUsers.length === 0 ? (
              <Alert severity="info">All available reps are already assigned to a manager.</Alert>
            ) : (
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                  Select unassigned reps to add to your team:
                </Typography>
                {unassignedRepUsers.map((repUser) => {
                  const displayName = `${repUser.firstName || ''} ${repUser.lastName || ''}`.trim() || repUser.username || repUser.email;
                  const repProfile  = repByUserId[repUser.id];
                  const displaySub  = repProfile?.territory || repUser.email || repUser.username || '';
                  return (
                    <Box key={repUser.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Avatar sx={{ bgcolor: 'primary.light', width: 36, height: 36, fontWeight: 700, fontSize: '0.85rem' }}>
                          {(displayName || '?').charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{displayName}</Typography>
                          <Typography variant="caption" color="text.secondary">{displaySub}</Typography>
                        </Box>
                      </Box>
                      <Button size="small" variant="contained" disabled={rosterSaving === repUser.id}
                        sx={{ bgcolor: '#16A34A', '&:hover': { bgcolor: '#15803d' } }}
                        onClick={() => handleAssignToRoster(repUser)}>
                        {rosterSaving === repUser.id ? 'Adding…' : 'Add'}
                      </Button>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setRosterDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        {/* ── Add Rep Dialog ───────────────────────────────────────────── */}
        <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle fontWeight={700}>Add Medical Representative</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Full Name *" size="small" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Phone" size="small" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Email" size="small" type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Territory" size="small" value={form.territory}
                  onChange={(e) => setForm({ ...form, territory: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Address" size="small" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth select label="Status" size="small" value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {REP_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>{STATUS_LABEL[s] || s}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Monthly Quota (₱)" type="number" size="small"
                  inputProps={{ min: 0 }} value={form.quotaMonthly}
                  onChange={(e) => setForm({ ...form, quotaMonthly: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline rows={2} label="Notes" size="small" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth select label="Assigned Manager" size="small" value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  helperText="Manager who approves this rep's orders">
                  <MenuItem value=""><em>None</em></MenuItem>
                  {managerUsers.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username} ({u.role.replace(/_/g, ' ')})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth select label="Linked System Account" size="small" value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  helperText="Optional: rep's login account">
                  <MenuItem value=""><em>None</em></MenuItem>
                  {salesRepUsers.filter((u) => !reps.some((r) => r.userId === u.id) || u.id === form.userId).map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving...' : 'Add Rep'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Assign Stock Dialog ──────────────────────────────────────── */}
        <Dialog open={!!assignOpen} onClose={() => setAssignOpen(null)} maxWidth="xs" fullWidth>
          <DialogTitle fontWeight={700}>Assign Stock to {assignOpen?.name}</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <TextField fullWidth select label="Product *" size="small" value={assignForm.productId}
                onChange={(e) => {
                  const prod = products.find((p) => p.id === e.target.value);
                  setAssignForm({ ...assignForm, productId: e.target.value, productName: prod?.name || '', unitPrice: prod?.price || 0, lotNumber: prod?.lotNumber || '', batchNumber: prod?.batchNumber || '' });
                }}>
                <MenuItem value=""><em>Select a product</em></MenuItem>
                {products.filter((p) => p.isActive !== false).map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}{p.strength ? ` ${p.strength}` : ''}{p.dosageForm ? ` (${p.dosageForm})` : ''}
                  </MenuItem>
                ))}
              </TextField>
              {assignForm.productId && (() => {
                const prod = products.find((p) => p.id === assignForm.productId);
                return (
                  <Box sx={{ px: 1.5, py: 1, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                      Unit Price: <strong>{formatCurrency(assignForm.unitPrice)}</strong>{prod?.unit ? ` / ${prod.unit}` : ''}
                      &nbsp;&bull;&nbsp; Stock: <strong>{prod?.stockLevel ?? '—'}</strong> units available
                    </Typography>
                  </Box>
                );
              })()}
              <TextField fullWidth label="Quantity *" type="number" size="small"
                inputProps={{ min: 1 }} value={assignForm.quantity}
                onChange={(e) => setAssignForm({ ...assignForm, quantity: e.target.value })} />
              <TextField fullWidth label="Lot Number" size="small" value={assignForm.lotNumber}
                onChange={(e) => setAssignForm({ ...assignForm, lotNumber: e.target.value })} />
              <TextField fullWidth label="Batch Number" size="small" value={assignForm.batchNumber}
                onChange={(e) => setAssignForm({ ...assignForm, batchNumber: e.target.value })} />
              <TextField fullWidth label="Territory" size="small" value={assignForm.territory}
                onChange={(e) => setAssignForm({ ...assignForm, territory: e.target.value })} />
              <TextField fullWidth label="Notes" size="small" value={assignForm.notes}
                onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} />
            </Stack>
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setAssignOpen(null)} disabled={saving}>Cancel</Button>
            <Button variant="contained" color="info" onClick={handleAssign} disabled={saving}>
              {saving ? 'Assigning...' : 'Assign Stock'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Encode Sale Dialog ───────────────────────────────────────── */}
        <Dialog open={!!salesOpen} onClose={() => setSalesOpen(null)} maxWidth="xs" fullWidth>
          <DialogTitle fontWeight={700}>Encode Sale — {salesOpen?.name}</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <TextField fullWidth label="Customer Name *" size="small" value={salesForm.customerName}
                onChange={(e) => setSalesForm({ ...salesForm, customerName: e.target.value })} />
              <TextField fullWidth label="Product Name *" size="small" value={salesForm.productName}
                onChange={(e) => setSalesForm({ ...salesForm, productName: e.target.value })} />
              <TextField fullWidth label="Quantity" type="number" size="small"
                inputProps={{ min: 1 }} value={salesForm.quantity}
                onChange={(e) => setSalesForm({ ...salesForm, quantity: e.target.value })} />
              <TextField fullWidth label="Unit Price (₱)" type="number" size="small"
                inputProps={{ min: 0, step: 0.01 }} value={salesForm.unitPrice}
                onChange={(e) => setSalesForm({ ...salesForm, unitPrice: e.target.value })} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
                Total: <strong>{formatCurrency((salesForm.quantity || 0) * (salesForm.unitPrice || 0))}</strong>
              </Typography>
              <TextField fullWidth label="Notes" size="small" value={salesForm.notes}
                onChange={(e) => setSalesForm({ ...salesForm, notes: e.target.value })} />
            </Stack>
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setSalesOpen(null)} disabled={saving}>Cancel</Button>
            <Button variant="contained" color="success" onClick={handleEncodeSale} disabled={saving}>
              {saving ? 'Encoding...' : 'Encode Sale'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── View Rep Dialog ──────────────────────────────────────────── */}
        <Dialog open={!!viewRep} onClose={() => setViewRep(null)} maxWidth="sm" fullWidth>
          {viewRep && (
            <>
              <DialogTitle fontWeight={700}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>{viewRep.name?.charAt(0)}</Avatar>
                  {viewRep.name}
                  <Chip label={STATUS_LABEL[viewRep.status] || viewRep.status} size="small" color={STATUS_COLOR[viewRep.status] || 'default'} />
                </Box>
              </DialogTitle>
              <Divider />
              <DialogContent sx={{ pt: 2 }}>
                <Grid container spacing={1.5}>
                  {[
                    ['Territory', viewRep.territory || '—'],
                    ['Phone',     viewRep.phone || '—'],
                    ['Email',     viewRep.email || '—'],
                    ['Address',   viewRep.address || '—'],
                  ].map(([label, val]) => (
                    <Grid item xs={6} key={label}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">{val}</Typography>
                    </Grid>
                  ))}
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">Assigned Manager</Typography>
                    <Typography variant="body2">
                      {viewRep.managerId
                        ? (() => { const m = managerUsers.find((u) => u.id === viewRep.managerId); return m ? `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.username : 'Unknown'; })()
                        : '—'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">System Account</Typography>
                    <Typography variant="body2">
                      {viewRep.userId
                        ? (() => { const u = users.find((u) => u.id === viewRep.userId); return u ? (u.username || `${u.firstName} ${u.lastName}`.trim()) : 'Linked'; })()
                        : '—'}
                    </Typography>
                  </Grid>
                </Grid>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  {[
                    ['Monthly Quota',   formatCurrency(viewRep.quotaMonthly || 0), 'primary.main'],
                    ['Sales This Month', formatCurrency(viewRep.salesThisMonth || 0), 'success.main'],
                    ['Assigned Stock',  repStock(viewRep.id).reduce((s, a) => s + (a.quantity || 0), 0) + ' units', 'info.main'],
                  ].map(([label, val, color]) => (
                    <Grid item xs={4} key={label}>
                      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography variant="subtitle2" fontWeight={700} color={color}>{val}</Typography>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                {viewRep.quotaMonthly > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Quota Achievement</Typography>
                      <Typography variant="caption" fontWeight={700}>
                        {Math.round(Math.min(100, ((viewRep.salesThisMonth || 0) / viewRep.quotaMonthly) * 100))}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, ((viewRep.salesThisMonth || 0) / viewRep.quotaMonthly) * 100)}
                      sx={{ height: 8, borderRadius: 4 }}
                      color={((viewRep.salesThisMonth || 0) / viewRep.quotaMonthly) >= 1 ? 'success' : ((viewRep.salesThisMonth || 0) / viewRep.quotaMonthly) >= 0.5 ? 'warning' : 'error'}
                    />
                  </Box>
                )}
                {viewRep.notes && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">Notes</Typography>
                    <Typography variant="body2">{viewRep.notes}</Typography>
                  </Box>
                )}
              </DialogContent>
              <Divider />
              <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => setViewRep(null)}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* ── Reject Sale Dialog ───────────────────────────────────────── */}
        {/* ── Sale Detail Dialog ────────────────────────────────────── */}
        <Dialog open={!!saleDetailOpen} onClose={() => setSaleDetailOpen(null)} maxWidth="sm" fullWidth>
          <DialogTitle fontWeight={700} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box>
              <Typography fontWeight={700}>Order Details</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                #{saleDetailOpen?.transactionNumber || saleDetailOpen?.id?.slice(-8).toUpperCase()}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setSaleDetailOpen(null)}><Close /></IconButton>
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            {saleDetailOpen && (() => {
              const s = saleDetailOpen;
              const isCredit = s.paymentMethod === 'credit_term';
              return (
                <Stack spacing={2}>
                  {/* Status banner */}
                  <Box sx={{ px: 2, py: 1, borderRadius: 1.5, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.light', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Chip label="Pending Approval" color="warning" size="small" sx={{ fontWeight: 700 }} />
                    <Typography variant="caption" color="text.secondary">
                      {s.createdAt ? formatDateTime(s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt)) : '—'}
                    </Typography>
                  </Box>

                  {/* Rep + Customer info */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.65rem' }}>Submitted By</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.75rem' }}>{(s._repName || '?')[0].toUpperCase()}</Avatar>
                        <Typography variant="body2" fontWeight={700}>{s._repName || '—'}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.65rem' }}>Customer</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>{s.customerName || 'Walk-in'}</Typography>
                      {s.customerPhone && <Typography variant="caption" color="text.secondary">{s.customerPhone}</Typography>}
                      {s.customerAddress && <Typography variant="caption" color="text.secondary" display="block">{s.customerAddress}</Typography>}
                    </Box>
                  </Box>

                  {/* Items table */}
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.65rem', mb: 0.5, display: 'block' }}>Products Ordered</Typography>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
                            {['Product', 'Qty', 'Unit Price', 'Total'].map((h) => (
                              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem' }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(s.items || []).map((item, i) => (
                            <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>{item.productName || item.name}</Typography>
                                {item.lotNumber && <Typography variant="caption" color="text.secondary">Lot: {item.lotNumber}</Typography>}
                                {item.batchNumber && <Typography variant="caption" color="text.secondary" sx={{ ml: item.lotNumber ? 1 : 0 }}>Batch: {item.batchNumber}</Typography>}
                              </TableCell>
                              <TableCell><Typography variant="body2">{item.quantity} {item.unit || 'pc'}</Typography></TableCell>
                              <TableCell><Typography variant="body2">{formatCurrency(item.unitPrice)}</Typography></TableCell>
                              <TableCell><Typography variant="body2" fontWeight={700}>{formatCurrency(item.totalPrice ?? (item.quantity * item.unitPrice))}</Typography></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  {/* Totals */}
                  <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                    <Stack spacing={0.5}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                        <Typography variant="body2">{formatCurrency(s.subtotal)}</Typography>
                      </Box>
                      {(s.discount || 0) > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="success.main">Discount</Typography>
                          <Typography variant="body2" color="success.main">- {formatCurrency(s.discount)}</Typography>
                        </Box>
                      )}
                      <Divider />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography fontWeight={800}>Total</Typography>
                        <Typography fontWeight={800} color="success.main" fontSize="1.15rem">{formatCurrency(s.total)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Payment Method</Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize' }}>{(s.paymentMethod || 'cash').replace(/_/g, ' ')}</Typography>
                      </Box>
                    </Stack>
                  </Box>

                  {/* Notes */}
                  {s.notes && (
                    <Box sx={{ p: 1.5, bgcolor: 'warning.50', borderRadius: 1.5, border: '1px solid', borderColor: 'warning.light' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.65rem' }}>Notes</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{s.notes}</Typography>
                    </Box>
                  )}
                </Stack>
              );
            })()}
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button onClick={() => setSaleDetailOpen(null)}>Close</Button>
            <Button variant="outlined" color="error"
              disabled={!!approving}
              startIcon={<ThumbDown />}
              onClick={() => { setRejectTarget({ id: saleDetailOpen?.id, name: saleDetailOpen?.customerName }); setRejectReason(''); setSaleDetailOpen(null); }}>
              Reject
            </Button>
            <Button variant="contained" color="success"
              disabled={approving === saleDetailOpen?.id}
              startIcon={approving === saleDetailOpen?.id ? <CircularProgress size={16} color="inherit" /> : <ThumbUp />}
              onClick={() => { handleApproveSale(saleDetailOpen.id); setSaleDetailOpen(null); }}>
              {approving === saleDetailOpen?.id ? 'Approving...' : 'Approve'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Set Quota Dialog ─────────────────────────────────────── */}
        <Dialog open={quotaDialogOpen} onClose={() => setQuotaDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle fontWeight={700} sx={{ pb: 1 }}>
            Set Monthly Quota
            {quotaRep && (
              <Typography variant="body2" color="text.secondary" fontWeight={400} sx={{ mt: 0.25 }}>
                {quotaRep.name} · {STATUS_LABEL[quotaRep.status] || quotaRep.status}
              </Typography>
            )}
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            {quotaRep && (() => {
              const currentSales = salesThisMonthByRepUserId[quotaRep.userId] || 0;
              const prevQuota    = quotaRep.quotaMonthly || 0;
              const newQuota     = Number(quotaValue) || 0;
              const pct          = newQuota > 0 ? Math.min(100, (currentSales / newQuota) * 100) : 0;
              return (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#F8FAFC', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.62rem' }}>
                    This Month's Performance
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75, mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={700} color="success.main">
                      {formatCurrency(currentSales)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {newQuota > 0 ? `of ${formatCurrency(newQuota)} target` : prevQuota > 0 ? `of ${formatCurrency(prevQuota)} (current)` : 'No quota set'}
                    </Typography>
                  </Box>
                  {newQuota > 0 && (
                    <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }}
                      color={pct >= 100 ? 'success' : pct >= 50 ? 'warning' : 'error'} />
                  )}
                  {newQuota > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {Math.round(pct)}% achieved · {newQuota > currentSales ? `${formatCurrency(newQuota - currentSales)} remaining` : 'Target met ✓'}
                    </Typography>
                  )}
                </Box>
              );
            })()}
            <TextField
              fullWidth
              label="Monthly Sales Quota (₱)"
              type="number"
              size="small"
              inputProps={{ min: 0, step: 1000 }}
              value={quotaValue}
              onChange={(e) => setQuotaValue(e.target.value)}
              helperText="This quota will be visible on the rep's portal. Set to 0 to remove quota."
            />
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button onClick={() => setQuotaDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleSetQuota} disabled={saving}>
              {saving ? 'Saving…' : 'Save Quota'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle fontWeight={700} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Reject Sale
            <IconButton size="small" onClick={() => setRejectTarget(null)}><Close /></IconButton>
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Rejecting sale for customer: <strong>{rejectTarget?.name || '—'}</strong>
            </Typography>
            <TextField
              fullWidth label="Reason for rejection *" multiline rows={3}
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Incorrect pricing, stock unavailable, etc."
            />
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button onClick={() => setRejectTarget(null)} disabled={!!approving}>Cancel</Button>
            <Button
              variant="contained" color="error"
              disabled={!rejectReason.trim() || !!approving}
              onClick={handleRejectSale}
              startIcon={approving ? <CircularProgress size={16} color="inherit" /> : <ThumbDown />}
            >
              {approving ? 'Rejecting...' : 'Reject Sale'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </AppLayout>
  );
}
