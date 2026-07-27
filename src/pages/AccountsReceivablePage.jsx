import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, Button, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Divider,
  Stack, InputAdornment, Tooltip, Alert, CircularProgress, LinearProgress,
} from '@mui/material';
import {
  Add, Search, Visibility, Payment, AccountBalance,
  Warning, CheckCircle, FilterList, Print, Schedule, Replay,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import AppLayout from '@/components/layout/AppLayout';
import useAuth from '@/hooks/useAuth';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc,
  serverTimestamp, where, Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS, AR_STATUSES, PAYMENT_METHODS } from '@/config/constants';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters';
import { logActivity } from '@/services/activity.service';
import { updatePaymentStatus as updateSalePaymentStatus } from '@/services/sales.service';
import { printPaymentReceipt } from '@/utils/receiptGenerator';

const STATUS_COLOR = { current: 'success', overdue: 'error', bad_debt: 'default', paid: 'info', cancelled: 'default' };
const AGING_BUCKETS = ['Current', '1-30 days', '31-60 days', '61-90 days', '90+ days'];

const getAgingBucket = (dueDate) => {
  if (!dueDate) return 'Current';
  const d = dueDate?.toDate ? dueDate.toDate() : new Date(dueDate);
  const daysOverdue = Math.ceil((new Date() - d) / 86400000);
  if (daysOverdue <= 0)  return 'Current';
  if (daysOverdue <= 30) return '1-30 days';
  if (daysOverdue <= 60) return '31-60 days';
  if (daysOverdue <= 90) return '61-90 days';
  return '90+ days';
};

/** How many installments have been paid based on cumulative amount */
const computeInstallmentsPaid = (amountPaid, installmentAmount) => {
  if (!installmentAmount || installmentAmount <= 0) return null;
  return Math.floor((amountPaid || 0) / installmentAmount);
};

/** Date when the next installment falls due */
const getNextInstallmentDue = (firstDue, installmentsPaid, frequency = 'monthly') => {
  if (!firstDue || installmentsPaid == null) return null;
  const d = firstDue?.toDate ? firstDue.toDate() : new Date(firstDue);
  const result = new Date(d);
  switch (frequency) {
    case 'weekly':     result.setDate(result.getDate() + installmentsPaid * 7); break;
    case 'bi_monthly': result.setDate(result.getDate() + installmentsPaid * 14); break;
    case 'monthly':
    default:           result.setMonth(result.getMonth() + installmentsPaid); break;
  }
  return result;
};

export default function AccountsReceivablePage() {
  const { user } = useAuth();
  const location = useLocation();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('all');
  const [viewRecord, setViewRecord] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [addOpen, setAddOpen]     = useState(false);
  const [payOpen, setPayOpen]     = useState(null); // record to record payment on
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  const [form, setForm] = useState({
    customerName: '', customerPhone: '', customerAddress: '',
    invoiceNumber: '', amount: 0, dueDate: null,
    paymentMethod: 'credit_term', notes: '',
    installmentTotal: '', installmentAmount: '',
    installmentFrequency: 'monthly', firstInstallmentDue: null,
  });
  const [payForm, setPayForm] = useState({ amount: 0, paymentMethod: 'cash', reference: '', notes: '' });
  const [refundOpen, setRefundOpen] = useState(null); // AR record to refund
  const [refundForm, setRefundForm] = useState({ amount: 0, reason: '' });
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.ACCOUNTS_RECEIVABLE), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Auto-open record highlighted via ?highlight=<id> from dashboard
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('highlight');
    if (!id || records.length === 0) return;
    const rec = records.find((r) => r.id === id);
    if (rec) {
      setHighlightId(id);
      setViewRecord(rec);
      setTimeout(() => {
        document.getElementById(`ar-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [location.search, records]);

  useEffect(() => {
    if (!viewRecord) { setPaymentHistory([]); return; }
    setLoadingHistory(true);
    const q = query(
      collection(db, COLLECTIONS.AR_PAYMENTS),
      where('arId', '==', viewRecord.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const hist = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setPaymentHistory(hist);
      setLoadingHistory(false);
    });
    return unsub;
  }, [viewRecord?.id]);

  const filtered = records.filter((r) => {
    const matchSearch = !search ||
      r.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      r.invoiceNumber?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalOutstanding = filtered.filter((r) => r.status !== 'paid').reduce((a, r) => a + ((r.amount || 0) - (r.amountPaid || 0)), 0);
  const overdueCount     = filtered.filter((r) => r.status === 'overdue').length;
  const paidCount        = filtered.filter((r) => r.status === 'paid').length;
  const totalAmount      = filtered.reduce((a, r) => a + (r.amount || 0), 0);

  // Records that have an installment plan with a payment due within the next 7 days
  const upcomingInstallments = records.filter((r) => {
    if (!r.installmentTotal || r.status === 'paid') return false;
    const instPaid = computeInstallmentsPaid(r.amountPaid, r.installmentAmount);
    if (instPaid == null || instPaid >= r.installmentTotal) return false;
    const nextDue = getNextInstallmentDue(r.firstInstallmentDue, instPaid, r.installmentFrequency);
    if (!nextDue) return false;
    return Math.ceil((nextDue - new Date()) / 86400000) <= 7;
  });

  const resetForm = () => {
    setForm({
      customerName: '', customerPhone: '', customerAddress: '',
      invoiceNumber: '', amount: 0, dueDate: null,
      paymentMethod: 'credit_term', notes: '',
      installmentTotal: '', installmentAmount: '',
      installmentFrequency: 'monthly', firstInstallmentDue: null,
    });
    setSaveError('');
  };

  const handleAdd = async () => {
    if (!form.customerName.trim()) { setSaveError('Customer name is required'); return; }
    if (!form.amount || form.amount <= 0) { setSaveError('Amount must be greater than 0'); return; }
    // Validate installment plan
    if (form.installmentTotal && form.installmentAmount) {
      const instTotal = Number(form.installmentTotal);
      const instAmt   = Number(form.installmentAmount);
      if (instTotal <= 0 || instAmt <= 0) { setSaveError('Installment count and amount must be greater than 0'); return; }
      const computed = parseFloat((instAmt * instTotal).toFixed(2));
      const expected = parseFloat(Number(form.amount).toFixed(2));
      if (Math.abs(computed - expected) > 1) {
        setSaveError(`Installment plan does not add up: ${instTotal} × ₱${instAmt.toLocaleString()} = ₱${computed.toLocaleString()} but total amount is ₱${expected.toLocaleString()}`);
        return;
      }
    }
    setSaveError(''); setSaving(true);
    try {
      await addDoc(collection(db, COLLECTIONS.ACCOUNTS_RECEIVABLE), {
        customerName:         form.customerName.trim(),
        customerPhone:        form.customerPhone.trim(),
        customerAddress:      form.customerAddress.trim(),
        invoiceNumber:        form.invoiceNumber.trim(),
        amount:               Number(form.amount),
        amountPaid:           0,
        balance:              Number(form.amount),
        dueDate:              form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
        paymentMethod:        form.paymentMethod,
        status:               'current',
        notes:                form.notes.trim(),
        installmentTotal:     form.installmentTotal ? Number(form.installmentTotal) : null,
        installmentAmount:    form.installmentAmount ? Number(form.installmentAmount) : null,
        installmentFrequency: form.installmentTotal ? form.installmentFrequency : null,
        firstInstallmentDue:  form.firstInstallmentDue && form.installmentTotal
          ? Timestamp.fromDate(new Date(form.firstInstallmentDue)) : null,
        createdBy:            user?.uid || '',
        createdAt:            serverTimestamp(),
        updatedAt:            serverTimestamp(),
      });
      await logActivity({ type: 'ar_created', description: `AR record created for ${form.customerName}`, userId: user?.uid });
      setAddOpen(false); resetForm();
    } catch (e) { setSaveError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handlePayment = async () => {
    if (!payForm.amount || payForm.amount <= 0) return;
    setSaving(true);
    try {
      const rec = payOpen;
      const newPaid    = (rec.amountPaid || 0) + Number(payForm.amount);
      const newBalance = Math.max(0, (rec.amount || 0) - newPaid);
      const newStatus  = newBalance <= 0 ? 'paid' : 'current';

      await addDoc(collection(db, COLLECTIONS.AR_PAYMENTS), {
        arId:          rec.id,
        customerName:  rec.customerName,
        amount:        Number(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        reference:     payForm.reference?.trim() || '',
        notes:         payForm.notes?.trim() || '',
        createdBy:     user?.uid || '',
        createdAt:     serverTimestamp(),
      });
      await updateDoc(doc(db, COLLECTIONS.ACCOUNTS_RECEIVABLE, rec.id), {
        amountPaid: newPaid, balance: newBalance, status: newStatus, updatedAt: serverTimestamp(),
      });
      // Sync sale payment status when AR is fully paid
      if (newBalance <= 0 && rec.saleId) {
        await updateSalePaymentStatus(rec.saleId, 'paid', user?.uid);
      }
      await logActivity({ type: 'ar_payment', description: `Payment of ${formatCurrency(payForm.amount)} recorded for ${rec.customerName}`, userId: user?.uid });
      // Print payment receipt
      const updatedRec = { ...rec, amountPaid: newPaid, balance: newBalance };
      const paymentDoc = { amount: Number(payForm.amount), paymentMethod: payForm.paymentMethod, reference: payForm.reference?.trim() || '', notes: payForm.notes?.trim() || '', createdAt: new Date() };
      printPaymentReceipt(updatedRec, paymentDoc);
      setPayOpen(null); setPayForm({ amount: 0, paymentMethod: 'cash', reference: '', notes: '' });
    } catch (e) { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleRefund = async () => {
    if (!refundForm.amount || refundForm.amount <= 0) return;
    const rec = refundOpen;
    const refundAmt = Math.min(Number(refundForm.amount), rec.amountPaid || 0);
    const newPaid    = Math.max(0, (rec.amountPaid || 0) - refundAmt);
    const newBalance = Math.min(rec.amount || 0, (rec.balance || 0) + refundAmt);
    setSaving(true);
    try {
      await addDoc(collection(db, COLLECTIONS.AR_PAYMENTS), {
        arId:          rec.id,
        customerName:  rec.customerName,
        amount:        -refundAmt,
        type:          'refund',
        reason:        refundForm.reason?.trim() || '',
        createdBy:     user?.uid || '',
        createdAt:     serverTimestamp(),
      });
      await updateDoc(doc(db, COLLECTIONS.ACCOUNTS_RECEIVABLE, rec.id), {
        amountPaid: newPaid,
        balance:    newBalance,
        status:     rec.status === 'paid' ? 'current' : rec.status,
        updatedAt:  serverTimestamp(),
      });
      if (rec.saleId) {
        await updateSalePaymentStatus(rec.saleId, newPaid <= 0 ? 'pending' : 'partial', user?.uid);
      }
      await logActivity({ type: 'ar_refund', description: `Refund of ${formatCurrency(refundAmt)} for ${rec.customerName}`, userId: user?.uid });
      setRefundOpen(null); setRefundForm({ amount: 0, reason: '' });
    } catch (e) { /* ignore */ }
    finally { setSaving(false); }
  };

  // ─── Print SOA ──────────────────────────────────────────────────────────────
  const printSOA = (record, payments) => {
    const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (v) => {
      if (!v) return '—';
      const d = v?.toDate ? v.toDate() : new Date(v);
      return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    };
    const now = new Date();
    const generatedOn = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const generatedTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

    // Installment data
    const instPaid = record.installmentAmount
      ? Math.floor((record.amountPaid || 0) / record.installmentAmount)
      : null;
    const instRemaining = instPaid != null ? (record.installmentTotal || 0) - instPaid : null;
    const nextDue = record.installmentTotal && instPaid != null
      ? getNextInstallmentDue(record.firstInstallmentDue, instPaid, record.installmentFrequency)
      : null;

    // Payment rows HTML
    const payRows = [...payments]
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
      .map((p, i) => {
        const isRefund = p.type === 'refund' || p.amount < 0;
        return `
          <tr>
            <td>${i + 1}</td>
            <td>${fmtDate(p.createdAt)}</td>
            <td>${isRefund ? '<span style="color:#dc2626">Refund</span>' : 'Payment'}</td>
            <td>${(p.paymentMethod || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</td>
            <td>${p.reference || '—'}</td>
            <td style="text-align:right;font-weight:600;color:${isRefund ? '#dc2626' : '#16a34a'}">${isRefund ? `(${fmt(Math.abs(p.amount))})` : fmt(p.amount)}</td>
          </tr>`;
      }).join('');

    const aging = record.status !== 'paid' ? getAgingBucket(record.dueDate) : 'Paid';
    const statusLabel = (record.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SOA — ${record.customerName}</title>
  <style>
    @page{size:A4;margin:14mm 16mm 12mm}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a2e;background:#fff;padding:0}
    .page{width:210mm;margin:0 auto;padding:14mm 16mm 12mm}
    /* Header */
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #16a34a;margin-bottom:16px}
    .logo{height:70px;width:auto;object-fit:contain}
    .company-name{font-size:20px;font-weight:800;color:#16a34a;letter-spacing:-0.5px}
    .company-sub{font-size:10px;color:#4b6b5d;margin-top:2px}
    .company-contact{font-size:9.5px;color:#4b6b5d;margin-top:1px}
    .doc-label{text-align:right}
    .doc-title{font-size:18px;font-weight:800;color:#0f1923;letter-spacing:0.5px;text-transform:uppercase}
    .doc-meta{font-size:9.5px;color:#6b7280;margin-top:3px}
    .doc-status{display:inline-block;margin-top:6px;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;
      background:${record.status === 'paid' ? '#dcfce7' : record.status === 'overdue' ? '#fee2e2' : '#fef9c3'};
      color:${record.status === 'paid' ? '#166534' : record.status === 'overdue' ? '#991b1b' : '#854d0e'};
      border:1px solid ${record.status === 'paid' ? '#86efac' : record.status === 'overdue' ? '#fca5a5' : '#fde047'}}
    /* Section */
    .section{margin-bottom:14px}
    .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4b6b5d;
      border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px}
    /* Two-col layout */
    .two-col{display:flex;gap:20px}
    .two-col > div{flex:1}
    .field-label{font-size:9.5px;color:#6b7280;margin-bottom:1px}
    .field-value{font-size:11.5px;font-weight:600;color:#1a1a2e}
    /* Summary boxes */
    .summary-boxes{display:flex;gap:10px;margin-bottom:14px}
    .summary-box{flex:1;border-radius:8px;padding:14px 16px;text-align:center;color:#fff;position:relative;overflow:hidden}
    .summary-box::after{content:'';position:absolute;top:-14px;right:-14px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.1)}
    .box-total  {background:linear-gradient(135deg,#16a34a,#15803d)}
    .box-paid   {background:linear-gradient(135deg,#0891b2,#0e7490)}
    .box-balance{background:${(record.balance || 0) <= 0 ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#ea580c,#c2410c)'}}
    .box-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.8);margin-bottom:6px}
    .box-amount{font-size:18px;font-weight:800;color:#fff;line-height:1}
    .box-sub{font-size:9px;color:rgba(255,255,255,0.7);margin-top:4px}
    /* Table */
    table{width:100%;border-collapse:collapse;font-size:11px}
    thead tr{background:#0d1f15;color:#fff}
    thead th{padding:7px 10px;text-align:left;font-weight:600;font-size:10px;letter-spacing:0.3px}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
    tfoot tr{background:#f1f5f9}
    tfoot td{padding:7px 10px;font-weight:700}
    /* Installment box */
    .inst-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
    .inst-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;margin-top:8px}
    .inst-grid div{background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:6px}
    .inst-num{font-size:16px;font-weight:800}
    .inst-lbl{font-size:9px;color:#6b7280;margin-top:1px}
    .inst-bar-wrap{background:#e5e7eb;border-radius:4px;height:6px;margin:8px 0 4px;overflow:hidden}
    .inst-bar{height:100%;background:#16a34a;border-radius:4px}
    /* Signature */
    .signature-row{display:flex;gap:30px;margin-top:24px}
    .sig-block{flex:1;text-align:center}
    .sig-line{border-top:1.5px solid #374151;margin-bottom:4px}
    .sig-label{font-size:9.5px;color:#6b7280}
    /* Footer */
    .footer{margin-top:20px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af}
    /* Page 2 */
    .page-break{page-break-before:always;break-before:page}
    .page2-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:3px solid #16a34a;margin-bottom:16px}
    .page2-client{font-size:13px;font-weight:700;color:#0f1923}
    .page2-title{font-size:11px;color:#4b6b5d;margin-top:2px}
    .sched-table th.due-col{width:110px}
    .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:9.5px;font-weight:700}
    .badge-paid   {background:#dcfce7;color:#166534}
    .badge-overdue{background:#fee2e2;color:#991b1b}
    .badge-next   {background:#fef9c3;color:#854d0e}
    .badge-pending{background:#f1f5f9;color:#475569}
    .aging-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px}
    .aging-cell{border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;text-align:center}
    .aging-cell.active{border-color:#ea580c;background:#fff7ed}
    .aging-num{font-size:15px;font-weight:800}
    .aging-lbl{font-size:8.5px;color:#6b7280;margin-top:2px}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page{padding:0;width:100%}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── Header ──────────────────────── -->
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="${window.location.origin}/logo.jpg" class="logo" alt="Therapevo Farmaco Logo" />
      <div>
        <div class="company-name">Therapevo Farmaco</div>
        <div class="company-sub">Integrated Pharmaceutical Distribution Management System</div>
        <div class="company-contact">0041 J.P. Rizal, San Pedro, Sasmuan, Philippines 2004</div>
        <div class="company-contact">therapevo.farmaco@gmail.com &nbsp;|&nbsp; +63 (0) 000-000-0000</div>
      </div>
    </div>
    <div class="doc-label">
      <div class="doc-title">Statement of Account</div>
      <div class="doc-meta">Generated: ${generatedOn} ${generatedTime}</div>
      ${record.invoiceNumber ? `<div class="doc-meta">Invoice #: <strong>${record.invoiceNumber}</strong></div>` : ''}
      <span class="doc-status">${statusLabel}</span>
    </div>
  </div>

  <!-- ── Client & Account Info ─────────── -->
  <div class="section">
    <div class="section-title">Bill To</div>
    <div class="two-col">
      <div>
        <div class="field-label">Client / Customer</div>
        <div class="field-value" style="font-size:14px">${record.customerName || '—'}</div>
        ${record.customerPhone ? `<div class="field-label" style="margin-top:6px">Phone</div><div class="field-value">${record.customerPhone}</div>` : ''}
        ${record.customerAddress ? `<div class="field-label" style="margin-top:6px">Address</div><div class="field-value">${record.customerAddress}</div>` : ''}
      </div>
      <div>
        <div class="field-label">Account Due Date</div>
        <div class="field-value">${fmtDate(record.dueDate)}</div>
        <div class="field-label" style="margin-top:6px">Payment Terms</div>
        <div class="field-value">${(record.paymentMethod || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</div>
        <div class="field-label" style="margin-top:6px">Aging</div>
        <div class="field-value">${aging}</div>
      </div>
    </div>
  </div>

  <!-- ── Summary Boxes ─────────────────── -->
  <div class="summary-boxes">
    <div class="summary-box box-total">
      <div class="box-label">Total Invoice Amount</div>
      <div class="box-amount">${fmt(record.amount)}</div>
      <div class="box-sub">${record.invoiceNumber ? 'Invoice #' + record.invoiceNumber : 'Credit Term'}</div>
    </div>
    <div class="summary-box box-paid">
      <div class="box-label">Amount Paid</div>
      <div class="box-amount">${fmt(record.amountPaid)}</div>
      <div class="box-sub">${record.amount > 0 ? Math.round(((record.amountPaid || 0) / record.amount) * 100) + '% of total' : '—'}</div>
    </div>
    <div class="summary-box box-balance">
      <div class="box-label">Outstanding Balance</div>
      <div class="box-amount">${fmt(record.balance)}</div>
      <div class="box-sub">${(record.balance || 0) <= 0 ? 'Fully Settled ✓' : 'Remaining to collect'}</div>
    </div>
  </div>

  ${record.installmentTotal ? `
  <!-- ── Installment Schedule ─────────── -->
  <div class="section">
    <div class="section-title">Installment Schedule</div>
    <div class="inst-box">
      <div class="two-col">
        <div>
          <span class="field-label">Installment Amount</span>&nbsp;
          <span class="field-value">${fmt(record.installmentAmount)} / ${(record.installmentFrequency || 'monthly').replace('_', '-')}</span>
        </div>
        <div style="text-align:right">
          <span class="field-label">Next Due Date</span>&nbsp;
          <span class="field-value">${nextDue && instRemaining > 0 ? fmtDate(nextDue) : '—'}</span>
        </div>
      </div>
      <div class="inst-grid">
        <div><div class="inst-num" style="color:#16a34a">${instPaid}</div><div class="inst-lbl">Paid</div></div>
        <div><div class="inst-num">${record.installmentTotal}</div><div class="inst-lbl">Total</div></div>
        <div><div class="inst-num" style="color:${instRemaining > 0 ? '#f59e0b' : '#16a34a'}">${instRemaining}</div><div class="inst-lbl">Remaining</div></div>
        <div><div class="inst-num" style="color:#0891b2">${Math.round(((instPaid || 0) / (record.installmentTotal || 1)) * 100)}%</div><div class="inst-lbl">Complete</div></div>
      </div>
      <div class="inst-bar-wrap" style="margin-top:10px">
        <div class="inst-bar" style="width:${Math.min(100, ((instPaid || 0) / (record.installmentTotal || 1)) * 100)}%"></div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- ── Payment History ────────────────── -->
  <div class="section">
    <div class="section-title">Payment History (${payments.length} transaction${payments.length !== 1 ? 's' : ''})</div>
    ${payments.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Date</th>
          <th>Type</th>
          <th>Method</th>
          <th>Reference</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${payRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right">Net Amount Paid</td>
          <td style="text-align:right">${fmt(record.amountPaid)}</td>
        </tr>
      </tfoot>
    </table>
    ` : '<p style="color:#6b7280;font-size:11px;padding:8px 0">No payment transactions recorded yet.</p>'}
  </div>

  ${record.notes ? `
  <!-- ── Notes ─────────────────────────── -->
  <div class="section">
    <div class="section-title">Notes</div>
    <p style="font-size:11px;color:#374151;line-height:1.5">${record.notes}</p>
  </div>
  ` : ''}

  <!-- ── Signature Block ────────────────── -->
  <div class="signature-row">
    <div class="sig-block">
      <div style="height:40px"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Prepared by / Accounting Officer</div>
    </div>
    <div class="sig-block">
      <div style="height:40px"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Reviewed by / Finance Manager</div>
    </div>
    <div class="sig-block">
      <div style="height:40px"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Received by / Client Signature</div>
    </div>
  </div>

  <!-- ── Footer ────────────────────────── -->
  <div class="footer">
    This is an official Statement of Account issued by <strong>Therapevo Farmaco</strong>. &nbsp;|&nbsp;
    For inquiries, contact our Accounting Department. &nbsp;|&nbsp;
    Generated on ${generatedOn} at ${generatedTime}
    ${(record.installmentTotal || (record.balance || 0) > 0) ? '&nbsp;|&nbsp; See Page 2 for Balance Detail' : ''}
  </div>

</div>

${(record.installmentTotal || (record.balance || 0) > 0) ? `
<!-- ════════════════════════════════════════════════════════════
     PAGE 2 — Balance Detail & Payment Schedule
════════════════════════════════════════════════════════════ -->
<div class="page page-break">

  <!-- Mini header -->
  <div class="page2-header">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="${window.location.origin}/logo.jpg" style="height:48px;width:auto;object-fit:contain" alt="Logo" />
      <div>
        <div style="font-size:13px;font-weight:800;color:#16a34a">Therapevo Farmaco</div>
        <div style="font-size:9px;color:#4b6b5d">0041 J.P. Rizal, San Pedro, Sasmuan, Philippines 2004</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:800;color:#0f1923;text-transform:uppercase;letter-spacing:0.5px">Balance Detail</div>
      <div style="font-size:9.5px;color:#6b7280">Page 2 of 2 &nbsp;|&nbsp; ${generatedOn}</div>
      ${record.invoiceNumber ? `<div style="font-size:9.5px;color:#6b7280">Invoice #: <strong>${record.invoiceNumber}</strong></div>` : ''}
    </div>
  </div>

  <!-- Client -->
  <div class="section">
    <div class="section-title">Client</div>
    <div class="two-col">
      <div>
        <div class="field-label">Customer Name</div>
        <div class="field-value" style="font-size:14px">${record.customerName || '—'}</div>
        ${record.customerAddress ? `<div class="field-label" style="margin-top:4px">Address</div><div class="field-value">${record.customerAddress}</div>` : ''}
      </div>
      <div>
        <div class="field-label">Account Status</div>
        <div class="field-value"><span class="doc-status">${statusLabel}</span></div>
        <div class="field-label" style="margin-top:6px">Payment Terms</div>
        <div class="field-value">${(record.paymentMethod || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</div>
      </div>
    </div>
  </div>

  <!-- Outstanding Balance Detail -->
  <div class="section">
    <div class="section-title">Outstanding Balance Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Original Invoice Amount</td>
          <td style="text-align:right;font-weight:600">${fmt(record.amount)}</td>
        </tr>
        <tr>
          <td>Less: Total Payments Received</td>
          <td style="text-align:right;font-weight:600;color:#0891b2">(${fmt(record.amountPaid || 0)})</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td style="font-size:12px">Outstanding Balance Due</td>
          <td style="text-align:right;font-size:14px;color:${(record.balance || 0) <= 0 ? '#16a34a' : '#ea580c'}">${fmt(record.balance)}</td>
        </tr>
      </tfoot>
    </table>
    ${(record.dueDate && (record.balance || 0) > 0) ? `
    <div style="margin-top:10px;padding:10px 14px;background:${(() => { const d = record.dueDate?.toDate ? record.dueDate.toDate() : new Date(record.dueDate); return d < new Date() ? '#fff1f2' : '#fefce8'; })()};border-radius:6px;border-left:4px solid ${(() => { const d = record.dueDate?.toDate ? record.dueDate.toDate() : new Date(record.dueDate); return d < new Date() ? '#ef4444' : '#f59e0b'; })()}">
      <div style="font-size:10px;font-weight:700;color:${(() => { const d = record.dueDate?.toDate ? record.dueDate.toDate() : new Date(record.dueDate); return d < new Date() ? '#991b1b' : '#854d0e'; })()}">
        ${(() => { const d = record.dueDate?.toDate ? record.dueDate.toDate() : new Date(record.dueDate); return d < new Date() ? '⚠ OVERDUE — Payment was due on ' + fmtDate(record.dueDate) : 'Payment Due: ' + fmtDate(record.dueDate); })()}
      </div>
      <div style="font-size:9.5px;color:#6b7280;margin-top:2px">Please settle the outstanding balance to avoid additional charges.</div>
    </div>
    ` : ''}
  </div>

  <!-- Aging Analysis -->
  <div class="section">
    <div class="section-title">Aging Analysis</div>
    <div class="aging-grid">
      ${['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'].map((bucket) => {
        const isActive = aging === bucket || (aging === '1-30 days' && bucket === '1–30 days') ||
          (aging === '31-60 days' && bucket === '31–60 days') ||
          (aging === '61-90 days' && bucket === '61–90 days');
        const bal = isActive && (record.balance || 0) > 0 ? (record.balance || 0) : 0;
        return `<div class="aging-cell${isActive && bal > 0 ? ' active' : ''}">
          <div class="aging-lbl">${bucket}</div>
          <div class="aging-num" style="color:${isActive && bal > 0 ? '#ea580c' : '#9ca3af'}">${isActive && bal > 0 ? fmt(bal) : '—'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  ${record.installmentTotal ? `
  <!-- Full Installment Payment Schedule -->
  <div class="section">
    <div class="section-title">Full Installment Payment Schedule</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th class="due-col">Due Date</th>
          <th style="text-align:right">Amount</th>
          <th style="text-align:center">Status</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${(() => {
          const rows = [];
          const firstDue = record.firstInstallmentDue;
          if (!firstDue) return '<tr><td colspan="5" style="color:#6b7280">No schedule data</td></tr>';
          const freq = record.installmentFrequency || 'monthly';
          const total = record.installmentTotal || 0;
          const instAmt = record.installmentAmount || 0;
          const paid = instPaid || 0;
          for (let i = 0; i < total; i++) {
            const d = firstDue?.toDate ? new Date(firstDue.toDate()) : new Date(firstDue);
            if (freq === 'weekly')     d.setDate(d.getDate() + i * 7);
            else if (freq === 'bi_monthly') d.setDate(d.getDate() + i * 14);
            else d.setMonth(d.getMonth() + i);
            const isPaid = i < paid;
            const isNext = i === paid && (record.balance || 0) > 0;
            const isOverdue = !isPaid && d < new Date();
            let badgeCls = 'badge-pending', badgeTxt = 'Upcoming';
            if (isPaid) { badgeCls = 'badge-paid'; badgeTxt = 'Paid'; }
            else if (isOverdue) { badgeCls = 'badge-overdue'; badgeTxt = 'Overdue'; }
            else if (isNext) { badgeCls = 'badge-next'; badgeTxt = 'Next Due'; }
            rows.push(`<tr style="${isNext ? 'background:#fefce8' : isOverdue && !isPaid ? 'background:#fff1f2' : ''}">
              <td>${i + 1}</td>
              <td>${d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
              <td style="text-align:right;font-weight:600">${fmt(instAmt)}</td>
              <td style="text-align:center"><span class="badge ${badgeCls}">${badgeTxt}</span></td>
              <td style="color:#6b7280;font-size:10px">${isPaid ? 'Payment received' : isNext ? 'Awaiting payment' : isOverdue ? 'Past due — please remit' : ''}</td>
            </tr>`);
          }
          return rows.join('');
        })()}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="text-align:right">Total Contract Value</td>
          <td style="text-align:right">${fmt(record.amount)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ''}

  <!-- Signature Block -->
  <div class="signature-row" style="margin-top:30px">
    <div class="sig-block">
      <div style="height:40px"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Prepared by / Accounting Officer</div>
    </div>
    <div class="sig-block">
      <div style="height:40px"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Reviewed by / Finance Manager</div>
    </div>
    <div class="sig-block">
      <div style="height:40px"></div>
      <div class="sig-line"></div>
      <div class="sig-label">Acknowledged by / Client</div>
    </div>
  </div>

  <div class="footer" style="margin-top:16px">
    Therapevo Farmaco &nbsp;|&nbsp; 0041 J.P. Rizal, San Pedro, Sasmuan, Philippines 2004 &nbsp;|&nbsp;
    therapevo.farmaco@gmail.com &nbsp;|&nbsp; Page 2 of 2
  </div>

</div>
` : ''}
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
  };

  return (
    <AppLayout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>Accounts Receivable</Typography>
            <Typography variant="body2" color="text.secondary">Customer ledger, outstanding balances, and collection monitoring</Typography>
          </Box>
          <Button variant="contained" startIcon={<Add />} onClick={() => { resetForm(); setAddOpen(true); }}>
            New AR Record
          </Button>
        </Box>

        {/* KPI Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Receivables',  value: formatCurrency(totalAmount),       icon: <AccountBalance />, color: 'primary.main' },
            { label: 'Outstanding Balance', value: formatCurrency(totalOutstanding), icon: <Warning />,        color: 'warning.main' },
            { label: 'Overdue Accounts',   value: overdueCount,                     icon: <Warning />,        color: 'error.main' },
            { label: 'Paid Accounts',      value: paidCount,                        icon: <CheckCircle />,    color: 'success.main' },
          ].map((kpi) => (
            <Grid item xs={6} md={3} key={kpi.label}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color: kpi.color }}>{kpi.value}</Typography>
                    </Box>
                    <Box sx={{ color: kpi.color, opacity: 0.7 }}>{kpi.icon}</Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Aging Summary */}
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Receivable Aging</Typography>
            <Grid container spacing={1}>
              {AGING_BUCKETS.map((bucket) => {
                const bucketRecs = filtered.filter((r) => r.status !== 'paid' && getAgingBucket(r.dueDate) === bucket);
                const bucketTotal = bucketRecs.reduce((a, r) => a + ((r.amount || 0) - (r.amountPaid || 0)), 0);
                return (
                  <Grid item xs key={bucket}>
                    <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: bucket === 'Current' ? 'success.50' : bucket === '1-30 days' ? 'warning.50' : 'error.50' }}>
                      <Typography variant="caption" color="text.secondary" display="block">{bucket}</Typography>
                      <Typography variant="body2" fontWeight={700}>{formatCurrency(bucketTotal)}</Typography>
                      <Typography variant="caption">{bucketRecs.length} accts</Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>

        {/* Upcoming installment reminder */}
        {upcomingInstallments.length > 0 && (
          <Alert severity="warning" icon={<Schedule />} sx={{ mb: 2 }}>
            <strong>
              {upcomingInstallments.length} installment{upcomingInstallments.length > 1 ? 's' : ''} due within 7 days
            </strong>
            {' — '}
            {upcomingInstallments.map((r) => {
              const instPaid = computeInstallmentsPaid(r.amountPaid, r.installmentAmount) ?? 0;
              const nextDue  = getNextInstallmentDue(r.firstInstallmentDue, instPaid, r.installmentFrequency);
              return `${r.customerName} (${formatDate(nextDue)})`;
            }).join(', ')}
          </Alert>
        )}

        {/* Filters */}
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} alignItems="center">
              <FilterList fontSize="small" color="action" />
              <TextField size="small" placeholder="Search customer or invoice #" value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                sx={{ minWidth: 240 }} />
              <TextField select size="small" label="Status" value={statusFilter}
                onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
                <MenuItem value="all">All</MenuItem>
                {Object.entries(AR_STATUSES).map(([k, v]) => (
                  <MenuItem key={k} value={v}>{v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </CardContent>
        </Card>

        {/* Table */}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                <TableCell>Customer</TableCell>
                <TableCell>Invoice #</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Collection Progress</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell>Aging</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>No AR records found</TableCell></TableRow>
              ) : filtered.map((r) => {
                const pct = r.amount > 0 ? Math.min(100, ((r.amountPaid || 0) / r.amount) * 100) : 0;
                return (
                  <TableRow
                    key={r.id}
                    hover
                    id={`ar-row-${r.id}`}
                    sx={highlightId === r.id ? { bgcolor: 'warning.50', outline: '2px solid', outlineColor: 'warning.main' } : {}}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{r.customerName}</Typography>
                      {r.customerPhone && <Typography variant="caption" color="text.secondary">{r.customerPhone}</Typography>}
                    </TableCell>
                    <TableCell><Typography variant="caption" color="primary">{r.invoiceNumber || '—'}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2">{formatCurrency(r.amount)}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" color="success.main">{formatCurrency(r.amountPaid || 0)}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" fontWeight={700} color={r.balance > 0 ? 'error.main' : 'success.main'}>{formatCurrency(r.balance || 0)}</Typography></TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      {r.installmentTotal ? (() => {
                        const instPaid = computeInstallmentsPaid(r.amountPaid, r.installmentAmount) ?? 0;
                        return (
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.5 }}>
                              <Typography variant="body2" fontWeight={700}
                                color={instPaid >= r.installmentTotal ? 'success.main' : 'text.primary'}>
                                {instPaid}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">/ {r.installmentTotal} paid</Typography>
                              {instPaid < r.installmentTotal && (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                  {formatCurrency(r.installmentAmount)}/ea
                                </Typography>
                              )}
                            </Box>
                            <LinearProgress variant="determinate" value={pct}
                              sx={{ height: 6, borderRadius: 3 }}
                              color={pct >= 100 ? 'success' : pct > 50 ? 'warning' : 'error'} />
                          </Box>
                        );
                      })() : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress variant="determinate" value={pct}
                            sx={{ flex: 1, height: 6, borderRadius: 3 }}
                            color={pct >= 100 ? 'success' : pct > 50 ? 'warning' : 'error'} />
                          <Typography variant="caption">{Math.round(pct)}%</Typography>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell><Typography variant="caption">{r.dueDate ? formatDate(r.dueDate) : '—'}</Typography></TableCell>
                    <TableCell>
                      <Typography variant="caption" color={getAgingBucket(r.dueDate) === 'Current' ? 'success.main' : 'error.main'}>
                        {r.status !== 'paid' ? getAgingBucket(r.dueDate) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell><Chip label={(r.status || '').replace(/_/g, ' ')} size="small" color={STATUS_COLOR[r.status] || 'default'} /></TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="View"><IconButton size="small" onClick={() => setViewRecord(r)}><Visibility fontSize="small" /></IconButton></Tooltip>
                        {r.status !== 'paid' && r.status !== 'cancelled' && (
                          <Tooltip title="Record Payment">
                            <IconButton size="small" color="success" onClick={() => {
                              const nextInstAmt = r.installmentAmount && r.installmentAmount < (r.balance || 0)
                                ? r.installmentAmount : (r.balance || 0);
                              setPayOpen(r);
                              setPayForm({ amount: nextInstAmt, paymentMethod: 'cash', reference: '', notes: '' });
                            }}>
                              <Payment fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {(r.amountPaid || 0) > 0 && (
                          <Tooltip title="Issue Refund">
                            <IconButton size="small" color="warning" onClick={() => {
                              setRefundOpen(r);
                              setRefundForm({ amount: 0, reason: '' });
                            }}>
                              <Replay fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ── Add AR Dialog ────────────────────────────────────────────── */}
        <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle fontWeight={700}>New Accounts Receivable</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Customer Name *" size="small" value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Customer Phone" size="small" value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Customer Address" size="small" value={form.customerAddress}
                  onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Invoice Number" size="small" value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Amount (₱) *" type="number" size="small"
                  inputProps={{ min: 0, step: 0.01 }} value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DatePicker label="Due Date" value={form.dueDate}
                  onChange={(v) => setForm({ ...form, dueDate: v })}
                  slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth select label="Payment Method" size="small" value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <MenuItem key={k} value={v}>{v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline rows={2} label="Notes" size="small" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Grid>

              {/* Installment plan setup */}
              <Grid item xs={12}>
                <Divider><Typography variant="caption" color="text.secondary">Installment Plan (optional)</Typography></Divider>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="No. of Installments" type="number" size="small"
                  inputProps={{ min: 2, max: 120 }}
                  value={form.installmentTotal}
                  helperText="e.g. 4 or 12 payments"
                  onChange={(e) => {
                    const n = e.target.value;
                    const auto = n && form.amount ? (Number(form.amount) / Number(n)).toFixed(2) : '';
                    setForm({ ...form, installmentTotal: n, installmentAmount: auto });
                  }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Amount per Installment (₱)" type="number" size="small"
                  inputProps={{ min: 0, step: 0.01 }}
                  value={form.installmentAmount}
                  helperText="Auto-filled from total ÷ count"
                  onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth select label="Frequency" size="small"
                  value={form.installmentFrequency}
                  disabled={!form.installmentTotal}
                  onChange={(e) => setForm({ ...form, installmentFrequency: e.target.value })}>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="bi_monthly">Every 2 Weeks</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                </TextField>
              </Grid>
              {/* Live installment validation hint */}
              {form.installmentTotal && form.installmentAmount && (() => {
                const computed = parseFloat((Number(form.installmentAmount) * Number(form.installmentTotal)).toFixed(2));
                const expected = parseFloat(Number(form.amount || 0).toFixed(2));
                const diff = Math.abs(computed - expected);
                if (diff <= 1) return null;
                return (
                  <Grid item xs={12}>
                    <Alert severity="error" sx={{ py: 0.5 }}>
                      {Number(form.installmentTotal)} × ₱{Number(form.installmentAmount).toLocaleString()} = ₱{computed.toLocaleString()} — must equal total amount ₱{expected.toLocaleString()} (difference: ₱{diff.toLocaleString()})
                    </Alert>
                  </Grid>
                );
              })()}
              <Grid item xs={12} sm={6}>
                <DatePicker label="First Installment Due"
                  value={form.firstInstallmentDue}
                  onChange={(v) => setForm({ ...form, firstInstallmentDue: v })}
                  disabled={!form.installmentTotal}
                  slotProps={{ textField: { fullWidth: true, size: 'small', helperText: 'Start date of payment schedule' } }} />
              </Grid>
            </Grid>
          </DialogContent>
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="contained" onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving...' : 'Create Record'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Record Payment Dialog ────────────────────────────────────── */}
        <Dialog open={!!payOpen} onClose={() => setPayOpen(null)} maxWidth="xs" fullWidth>
          <DialogTitle fontWeight={700}>Record Payment</DialogTitle>
          <Divider />
          {payOpen && (
            <DialogContent sx={{ pt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Customer: <strong>{payOpen.customerName}</strong> | Balance: <strong>{formatCurrency(payOpen.balance || 0)}</strong>
              </Typography>
              {payOpen.installmentTotal && (() => {
                const instPaid  = computeInstallmentsPaid(payOpen.amountPaid, payOpen.installmentAmount) ?? 0;
                const remaining = payOpen.installmentTotal - instPaid;
                const enteredAmt = Number(payForm.amount) || 0;
                const coversCount = payOpen.installmentAmount > 0
                  ? Math.floor(enteredAmt / payOpen.installmentAmount) : 0;
                const isAdvance = coversCount > 1;
                return (
                  <>
                    <Alert severity={isAdvance ? 'success' : 'info'} sx={{ mb: 1.5, py: 0.5 }}>
                      {isAdvance
                        ? <>Advance payment — covers <strong>{coversCount}</strong> installment{coversCount > 1 ? 's' : ''} (installment {instPaid + 1}–{Math.min(instPaid + coversCount, payOpen.installmentTotal)} of {payOpen.installmentTotal})</>
                        : <>Recording installment <strong>{instPaid + 1}</strong> of <strong>{payOpen.installmentTotal}</strong> — expected: <strong>{formatCurrency(payOpen.installmentAmount)}</strong></>
                      }
                    </Alert>
                    {/* Quick-fill buttons */}
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                      {[1, 2, 3].filter((n) => n <= remaining).map((n) => (
                        <Button key={n} size="small" variant="outlined"
                          onClick={() => setPayForm({ ...payForm, amount: parseFloat((payOpen.installmentAmount * n).toFixed(2)) })}>
                          {n === 1 ? '1 Installment' : `${n} Installments`}
                        </Button>
                      ))}
                      <Button size="small" variant="outlined" color="success"
                        onClick={() => setPayForm({ ...payForm, amount: parseFloat((payOpen.balance || 0).toFixed(2)) })}>
                        Full Balance
                      </Button>
                    </Stack>
                  </>
                );
              })()}
              {!payOpen.installmentTotal && (
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <Button size="small" variant="outlined" color="success"
                    onClick={() => setPayForm({ ...payForm, amount: parseFloat((payOpen.balance || 0).toFixed(2)) })}>
                    Full Balance
                  </Button>
                </Stack>
              )}
              <Stack spacing={2}>
                <TextField fullWidth label="Payment Amount (₱) *" type="number" size="small"
                  inputProps={{ min: 0, step: 0.01, max: payOpen.balance }}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                <TextField fullWidth select label="Payment Method" size="small" value={payForm.paymentMethod}
                  onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                    <MenuItem key={k} value={v}>{v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
                  ))}
                </TextField>
                <TextField fullWidth label="Reference / Check #" size="small" value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
                <TextField fullWidth label="Notes" size="small" value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </Stack>
            </DialogContent>
          )}
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setPayOpen(null)} disabled={saving}>Cancel</Button>
            <Button variant="contained" color="success" onClick={handlePayment} disabled={saving}>
              {saving ? 'Saving...' : 'Confirm Payment'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── View Record Dialog ───────────────────────────────────────── */}
        <Dialog open={!!viewRecord} onClose={() => setViewRecord(null)} maxWidth="sm" fullWidth>
          {viewRecord && (
            <>
              <DialogTitle fontWeight={700}>
                AR Record — {viewRecord.customerName}
                <Chip label={(viewRecord.status || '').replace(/_/g, ' ')} size="small"
                  color={STATUS_COLOR[viewRecord.status] || 'default'} sx={{ ml: 1 }} />
              </DialogTitle>
              <Divider />
              <DialogContent sx={{ pt: 2 }}>
                <Grid container spacing={1.5}>
                  {[
                    ['Invoice #',    viewRecord.invoiceNumber || '—'],
                    ['Phone',        viewRecord.customerPhone || '—'],
                    ['Address',      viewRecord.customerAddress || '—'],
                    ['Due Date',     viewRecord.dueDate ? formatDate(viewRecord.dueDate) : '—'],
                    ['Aging',        viewRecord.status !== 'paid' ? getAgingBucket(viewRecord.dueDate) : '—'],
                    ['Payment Method', (viewRecord.paymentMethod || '').replace(/_/g, ' ')],
                  ].map(([label, val]) => (
                    <Grid item xs={6} key={label}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">{val}</Typography>
                    </Grid>
                  ))}
                </Grid>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  {[
                    ['Total Amount',  formatCurrency(viewRecord.amount), 'primary.main'],
                    ['Amount Paid',   formatCurrency(viewRecord.amountPaid || 0), 'success.main'],
                    ['Balance',       formatCurrency(viewRecord.balance || 0), 'error.main'],
                  ].map(([label, val, color]) => (
                    <Grid item xs={4} key={label}>
                      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography variant="subtitle2" fontWeight={700} color={color}>{val}</Typography>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                {viewRecord.notes && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">Notes</Typography>
                    <Typography variant="body2">{viewRecord.notes}</Typography>
                  </Box>
                )}

                {/* Installment schedule summary */}
                {viewRecord.installmentTotal && (() => {
                  const instPaid = computeInstallmentsPaid(viewRecord.amountPaid, viewRecord.installmentAmount) ?? 0;
                  const remaining = viewRecord.installmentTotal - instPaid;
                  const nextDue = getNextInstallmentDue(viewRecord.firstInstallmentDue, instPaid, viewRecord.installmentFrequency);
                  const daysUntil = nextDue ? Math.ceil((nextDue - new Date()) / 86400000) : null;
                  return (
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Installment Schedule</Typography>
                      <Grid container spacing={1} sx={{ mb: 1 }}>
                        <Grid item xs={4} sx={{ textAlign: 'center' }}>
                          <Typography variant="h5" fontWeight={800} color="success.main">{instPaid}</Typography>
                          <Typography variant="caption" color="text.secondary">Paid</Typography>
                        </Grid>
                        <Grid item xs={4} sx={{ textAlign: 'center' }}>
                          <Typography variant="h5" fontWeight={800}>{viewRecord.installmentTotal}</Typography>
                          <Typography variant="caption" color="text.secondary">Total</Typography>
                        </Grid>
                        <Grid item xs={4} sx={{ textAlign: 'center' }}>
                          <Typography variant="h5" fontWeight={800} color={remaining > 0 ? 'warning.main' : 'success.main'}>{remaining}</Typography>
                          <Typography variant="caption" color="text.secondary">Remaining</Typography>
                        </Grid>
                      </Grid>
                      <LinearProgress variant="determinate"
                        value={Math.min(100, (instPaid / viewRecord.installmentTotal) * 100)}
                        sx={{ height: 8, borderRadius: 4, mb: 1 }}
                        color={remaining === 0 ? 'success' : instPaid > viewRecord.installmentTotal / 2 ? 'warning' : 'error'} />
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrency(viewRecord.installmentAmount)} / {viewRecord.installmentFrequency?.replace('_', '-') || 'installment'}
                        </Typography>
                        {nextDue && remaining > 0 && (
                          <Typography variant="caption"
                            color={daysUntil != null && daysUntil <= 0 ? 'error.main' : daysUntil != null && daysUntil <= 7 ? 'warning.main' : 'text.secondary'}>
                            Next due: {formatDate(nextDue)}
                            {daysUntil != null && daysUntil <= 0 ? ' (OVERDUE)' : daysUntil != null && daysUntil <= 7 ? ` (in ${daysUntil}d)` : ''}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  );
                })()}

                {/* Payment history */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Payment History</Typography>
                  {loadingHistory ? (
                    <CircularProgress size={20} />
                  ) : paymentHistory.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No payments recorded yet.</Typography>
                  ) : (
                    <Stack spacing={0.5}>
                      {paymentHistory.map((p, idx) => (
                        <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Box>
                            <Typography variant="body2" fontWeight={600} color={p.amount < 0 ? 'error.main' : 'success.main'}>
                              {p.amount < 0 ? `Refund: ${formatCurrency(Math.abs(p.amount))}` : formatCurrency(p.amount)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {p.amount < 0 ? 'Refund' : p.paymentMethod?.replace(/_/g, ' ')} {p.reference ? `· ${p.reference}` : ''}
                            </Typography>
                            {p.amount < 0 && p.reason && (
                              <Typography variant="caption" display="block" color="error.main" sx={{ fontStyle: 'italic' }}>
                                Reason: {p.reason}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="caption" color="text.secondary">
                                Payment #{paymentHistory.length - idx}
                              </Typography>
                              <Typography variant="caption" display="block" color="text.secondary">
                                {p.createdAt ? formatDate(p.createdAt) : ''}
                              </Typography>
                            </Box>
                            {p.amount > 0 && (
                              <Tooltip title="Print Receipt">
                                <IconButton size="small" onClick={() => printPaymentReceipt(viewRecord, p)}>
                                  <Print fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              </DialogContent>
              <Divider />
              <DialogActions sx={{ p: 2 }}>
                <Button startIcon={<Print />} variant="outlined" size="small" onClick={() => printSOA(viewRecord, paymentHistory)}>Print SOA</Button>
                {viewRecord.status !== 'paid' && viewRecord.status !== 'cancelled' && (
                  <Button variant="contained" color="success" startIcon={<Payment />} size="small" onClick={() => {
                    const nextInstAmt = viewRecord.installmentAmount && viewRecord.installmentAmount < (viewRecord.balance || 0)
                      ? viewRecord.installmentAmount : (viewRecord.balance || 0);
                    setPayOpen(viewRecord);
                    setPayForm({ amount: nextInstAmt, paymentMethod: 'cash', reference: '', notes: '' });
                    setViewRecord(null);
                  }}>Record Payment</Button>
                )}
                {(viewRecord.amountPaid || 0) > 0 && (
                  <Button variant="outlined" color="warning" startIcon={<Replay />} size="small" onClick={() => {
                    setRefundOpen(viewRecord);
                    setRefundForm({ amount: 0, reason: '' });
                    setViewRecord(null);
                  }}>Issue Refund</Button>
                )}
                <Button onClick={() => setViewRecord(null)}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>

        {/* ── Refund Dialog ────────────────────────────────────────────── */}
        <Dialog open={!!refundOpen} onClose={() => setRefundOpen(null)} maxWidth="xs" fullWidth>
          <DialogTitle fontWeight={700} sx={{ color: 'warning.dark' }}>Issue Refund</DialogTitle>
          <Divider />
          {refundOpen && (
            <DialogContent sx={{ pt: 2 }}>
              <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>
                Amount paid so far: <strong>{formatCurrency(refundOpen.amountPaid || 0)}</strong>. Refund cannot exceed this amount.
              </Alert>
              <Stack spacing={2}>
                <TextField fullWidth label="Refund Amount (₱) *" type="number" size="small"
                  inputProps={{ min: 0.01, step: 0.01, max: refundOpen.amountPaid || 0 }}
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })} />
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={() => setRefundForm({ ...refundForm, amount: refundOpen.amountPaid || 0 })}>
                    Full Amount
                  </Button>
                </Stack>
                <TextField fullWidth label="Reason for Refund *" size="small" multiline rows={2}
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} />
              </Stack>
            </DialogContent>
          )}
          <Divider />
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setRefundOpen(null)} disabled={saving}>Cancel</Button>
            <Button variant="contained" color="warning" startIcon={<Replay />}
              onClick={handleRefund}
              disabled={saving || !refundForm.amount || !refundForm.reason?.trim()}>
              {saving ? 'Processing...' : 'Confirm Refund'}
            </Button>
          </DialogActions>
        </Dialog>
    </AppLayout>
  );
}
