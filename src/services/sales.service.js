import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  runTransaction,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';
import { logActivity } from './activity.service';

const salesRef    = collection(db, COLLECTIONS.SALES_TRANSACTIONS);
const productsRef = collection(db, COLLECTIONS.PRODUCTS);
const movementsRef = collection(db, COLLECTIONS.INVENTORY_MOVEMENTS);
const counterRef  = doc(db, 'system_counters', 'sales');

// ─── Custom error for insufficient stock ─────────────────────────────────────

export class InsufficientStockError extends Error {
  constructor(shortfalls) {
    super('Insufficient stock for one or more products');
    this.name = 'InsufficientStockError';
    // shortfalls: [{ productId, productName, requested, available }]
    this.shortfalls = shortfalls;
  }
}

// ─── Internal: log a stock movement to the pharma ledger ─────────────────────
// Every deduction or restoration is recorded here for full traceability.

const _logMovement = async (batch, { productId, productName, type, qty, before, after, saleId, transactionNumber, reason, userId }) => {
  const ref = doc(movementsRef);
  batch.set(ref, {
    productId,
    productName,
    type,               // 'sale_deduction' | 'sale_restoration' | 'manual_adjustment'
    quantity: qty,      // always positive; direction is captured in `type`
    stockBefore: before,
    stockAfter: after,
    saleId:            saleId || null,
    transactionNumber: transactionNumber || null,
    reason:            reason || '',
    performedBy:       userId || '',
    createdAt:         serverTimestamp(),
  });
};

// ─── Internal: deduct stock for a sale (atomic, validates sufficiency) ────────
// Uses a Firestore runTransaction so reads and writes are atomic — prevents
// race conditions between concurrent sales (critical for pharma).

const _deductSaleStock = async (items, saleId, transactionNumber, userId) => {
  const shortfalls = [];

  await runTransaction(db, async (tx) => {
    // 1. Read all product docs inside the transaction
    const productRefs = items
      .filter((i) => i.productId)
      .map((i) => doc(productsRef, i.productId));

    const snaps = await Promise.all(productRefs.map((r) => tx.get(r)));

    // 2. Validate stock sufficiency for every item
    snaps.forEach((snap, idx) => {
      const item = items[idx];
      if (!snap.exists()) return;
      const available = snap.data().stockLevel ?? 0;
      const requested = Number(item.quantity) || 0;
      if (available < requested) {
        shortfalls.push({
          productId:   item.productId,
          productName: item.productName || snap.data().name || item.productId,
          requested,
          available,
        });
      }
    });

    if (shortfalls.length > 0) throw new InsufficientStockError(shortfalls);

    // 3. Apply decrements & queue movement logs
    snaps.forEach((snap, idx) => {
      const item   = items[idx];
      if (!snap.exists() || !item.productId) return;
      const before = snap.data().stockLevel ?? 0;
      const qty    = Number(item.quantity) || 0;
      const after  = before - qty;

      tx.update(snap.ref, {
        stockLevel: increment(-qty),
        // Auto-mark unavailable if stock hits zero
        ...(after <= 0 ? { isAvailable: false } : {}),
        updatedAt: serverTimestamp(),
      });

      // Queue movement log inside transaction (set, not addDoc)
      const movRef = doc(movementsRef);
      tx.set(movRef, {
        productId:         item.productId,
        productName:       item.productName || snap.data().name || '',
        type:              'sale_deduction',
        quantity:          qty,
        stockBefore:       before,
        stockAfter:        after,
        saleId:            saleId || null,
        transactionNumber: transactionNumber || null,
        reason:            `Sale #${transactionNumber} — stock deducted on dispatch`,
        performedBy:       userId || '',
        createdAt:         serverTimestamp(),
      });
    });
  });
};

// ─── Internal: restore stock when a sale is cancelled/rejected ───────────────

const _restoreSaleStock = async (items, saleId, transactionNumber, userId, reason) => {
  const batch = writeBatch(db);

  await Promise.all(
    items
      .filter((i) => i.productId)
      .map(async (item) => {
        const snapRef = doc(productsRef, item.productId);
        const snap    = await getDoc(snapRef);
        if (!snap.exists()) return;

        const before = snap.data().stockLevel ?? 0;
        const qty    = Number(item.quantity) || 0;
        const after  = before + qty;

        batch.update(snapRef, {
          stockLevel: increment(qty),
          // Re-enable availability if it was zeroed out by this sale
          isAvailable: true,
          updatedAt: serverTimestamp(),
        });

        await _logMovement(batch, {
          productId:         item.productId,
          productName:       item.productName || snap.data().name || '',
          type:              'sale_restoration',
          qty,
          before,
          after,
          saleId,
          transactionNumber,
          reason:            reason || `Sale #${transactionNumber} — stock restored on cancellation`,
          userId,
        });
      })
  );

  await batch.commit();
};

// ─── Sequential Transaction Number ───────────────────────────────────────────

const getNextTransactionNumber = async () => {
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? snap.data().current || 0 : 0) + 1;
    tx.set(counterRef, { current: next }, { merge: true });
    return String(next).padStart(6, '0');
  });
};

// ─── Create Sale ──────────────────────────────────────────────────────────────

export const createSale = async (data, items, userId, requireApproval = false, assignedManagerId = '', submittedByName = '') => {
  const transactionNumber = await getNextTransactionNumber();
  const isImmediate = !requireApproval; // stock deducted immediately for non-approval flow

  // ── 1. Validate & deduct stock BEFORE writing the sale document ──────────
  // For non-approval flow (walk-in / direct sales), stock is deducted atomically.
  // For approval-required sales, stock is deducted upon manager approval.
  if (isImmediate) {
    await _deductSaleStock(items, null, transactionNumber, userId);
    // throws InsufficientStockError if any product is short — caller must catch it
  }

  const arRef = collection(db, COLLECTIONS.ACCOUNTS_RECEIVABLE);

  const saleRef = await addDoc(salesRef, {
    transactionNumber,
    customerName:      data.customerName?.trim() || '',
    customerPhone:     data.customerPhone?.trim() || '',
    customerAddress:   data.customerAddress?.trim() || '',
    orderType:         data.orderType || 'walk_in',
    paymentMethod:     data.paymentMethod || 'cash',
    paymentStatus:     data.paymentMethod === 'credit_term' ? 'pending' : 'paid',
    status:            requireApproval ? 'pending_approval' : 'completed',
    stockDeducted:     isImmediate,   // ← tracks whether stock has been pulled
    submittedBy:       userId || '',
    submittedByName:   submittedByName || '',
    assignedManagerId: assignedManagerId || '',
    items:           items.map((i) => ({
      productId:   i.productId || '',
      productName: i.productName || '',
      unit:        i.unit || 'pc',
      quantity:    Number(i.quantity) || 0,
      unitPrice:   Number(i.unitPrice) || 0,
      totalPrice:  Number(i.quantity) * Number(i.unitPrice),
    })),
    subtotal:   Number(data.subtotal) || 0,
    discount:   Number(data.discount) || 0,
    total:      Number(data.total) || 0,
    notes:      data.notes?.trim() || '',
    createdBy:  userId || '',
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });

  // Auto-create Accounts Receivable record for credit-term sales
  if (data.paymentMethod === 'credit_term') {
    await addDoc(arRef, {
      customerName:         data.customerName?.trim() || '',
      customerPhone:        data.customerPhone?.trim() || '',
      customerAddress:      data.customerAddress?.trim() || '',
      invoiceNumber:        transactionNumber,
      amount:               Number(data.total) || 0,
      amountPaid:           0,
      balance:              Number(data.total) || 0,
      dueDate:              data.dueDate ? Timestamp.fromDate(new Date(data.dueDate)) : null,
      paymentMethod:        'credit_term',
      status:               'current',
      notes:                data.notes?.trim() || '',
      saleId:               saleRef.id,
      installmentTotal:     data.installmentTotal ? Number(data.installmentTotal) : null,
      installmentAmount:    data.installmentAmount ? Number(data.installmentAmount) : null,
      installmentFrequency: data.installmentTotal  ? data.installmentFrequency || 'monthly' : null,
      firstInstallmentDue:  data.firstInstallmentDue && data.installmentTotal
        ? Timestamp.fromDate(new Date(data.firstInstallmentDue)) : null,
      createdBy:            userId || '',
      createdAt:            serverTimestamp(),
      updatedAt:            serverTimestamp(),
    });
  }

  await logActivity({
    type: 'sale_created',
    description: requireApproval
      ? `Sale #${transactionNumber} submitted by rep — awaiting approval`
      : `Sale #${transactionNumber} created for ${data.customerName || 'Walk-in'}`,
    userId,
    meta: { saleId: saleRef.id, transactionNumber, total: data.total },
  });

  return { id: saleRef.id, transactionNumber };
};

// ─── Approve Sale ─────────────────────────────────────────────────────────────────────────────────

export const approveSale = async (saleId, userId, notes = '') => {
  const saleSnap = await getDoc(doc(salesRef, saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const sale = saleSnap.data();

  // Deduct stock only if it hasn't been deducted yet (pending_approval flow)
  if (!sale.stockDeducted) {
    await _deductSaleStock(
      sale.items || [],
      saleId,
      sale.transactionNumber,
      userId
    );
    // throws InsufficientStockError if any item is short — caller must handle
  }

  await updateDoc(doc(salesRef, saleId), {
    status:        'approved',
    stockDeducted: true,
    approvedBy:    userId,
    approvedAt:    serverTimestamp(),
    approvalNotes: notes.trim(),
    updatedAt:     serverTimestamp(),
  });
  await logActivity({
    type: 'sale_approved',
    description: `Sale #${sale.transactionNumber} approved${notes ? ': ' + notes : ''}`,
    userId,
    meta: { saleId, notes },
  });
};

// ─── Reject Sale ──────────────────────────────────────────────────────────────────────────────────

export const rejectSale = async (saleId, userId, reason) => {
  // Fetch sale first to get submittedBy, transactionNumber, paymentMethod, stockDeducted
  const saleSnap = await getDoc(doc(salesRef, saleId));
  const sale = saleSnap.data() || {};

  // Restore stock only if it was previously deducted
  if (sale.stockDeducted && sale.items?.length) {
    await _restoreSaleStock(
      sale.items,
      saleId,
      sale.transactionNumber,
      userId,
      `Sale #${sale.transactionNumber} rejected — stock restored. Reason: ${reason}`
    );
  }

  // Set status to cancelled and record rejection details
  await updateDoc(doc(salesRef, saleId), {
    status:          'cancelled',
    paymentStatus:   'cancelled',
    stockDeducted:   false,
    rejectedBy:      userId,
    rejectedAt:      serverTimestamp(),
    rejectionReason: reason.trim(),
    updatedAt:       serverTimestamp(),
  });

  // Cancel the linked AR record if the sale was on credit terms
  if (sale.paymentMethod === 'credit_term') {
    const arSnap = await getDocs(
      query(collection(db, COLLECTIONS.ACCOUNTS_RECEIVABLE), where('saleId', '==', saleId))
    );
    for (const d of arSnap.docs) {
      await updateDoc(d.ref, {
        status:    'cancelled',
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Send notification to the rep who submitted the order
  if (sale.submittedBy) {
    await addDoc(collection(db, COLLECTIONS.USER_NOTIFICATIONS), {
      userId:            sale.submittedBy,
      type:              'sale_rejected',
      title:             'Order Request Rejected',
      message:           `Your order #${sale.transactionNumber} was rejected. Reason: ${reason.trim()}`,
      saleId,
      transactionNumber: sale.transactionNumber || '',
      reason:            reason.trim(),
      read:              false,
      createdAt:         serverTimestamp(),
    });
  }

  await logActivity({
    type: 'sale_rejected',
    description: `Sale rejected — ${reason}`,
    userId,
    meta: { saleId, reason },
  });
};

// ─── Get Sales by Date Range ──────────────────────────────────────────────────

export const getSalesByDateRange = async (start, end) => {
  const q = query(
    salesRef,
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end)),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ─── Subscribe to Sales ───────────────────────────────────────────────────────

export const subscribeToSales = (start, end, callback) => {
  const q = query(
    salesRef,
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end)),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
};

// ─── Cancel Sale ─────────────────────────────────────────────────────────────
// Explicit cancellation by a user — restores stock if previously deducted.

export const cancelSale = async (saleId, userId, reason = '') => {
  const saleSnap = await getDoc(doc(salesRef, saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const sale = saleSnap.data();

  const terminalStatuses = ['cancelled', 'returned'];
  if (terminalStatuses.includes(sale.status)) {
    throw new Error(`Sale is already ${sale.status} and cannot be cancelled again.`);
  }

  // Restore stock if it was deducted
  if (sale.stockDeducted && sale.items?.length) {
    await _restoreSaleStock(
      sale.items,
      saleId,
      sale.transactionNumber,
      userId,
      `Sale #${sale.transactionNumber} cancelled — stock restored. ${reason ? 'Reason: ' + reason : ''}`.trim()
    );
  }

  await updateDoc(doc(salesRef, saleId), {
    status:           'cancelled',
    paymentStatus:    'cancelled',
    stockDeducted:    false,
    cancelledBy:      userId,
    cancelledAt:      serverTimestamp(),
    cancellationReason: reason.trim(),
    updatedAt:        serverTimestamp(),
  });

  // Cancel linked AR record if on credit term
  if (sale.paymentMethod === 'credit_term') {
    const arSnap = await getDocs(
      query(collection(db, COLLECTIONS.ACCOUNTS_RECEIVABLE), where('saleId', '==', saleId))
    );
    for (const d of arSnap.docs) {
      await updateDoc(d.ref, { status: 'cancelled', updatedAt: serverTimestamp() });
    }
  }

  await logActivity({
    type: 'sale_cancelled',
    description: `Sale #${sale.transactionNumber} cancelled${reason ? ' — ' + reason : ''}`,
    userId,
    meta: { saleId, reason, stockRestored: sale.stockDeducted === true },
  });
};

// ─── Update Sale Status ───────────────────────────────────────────────────────
// Generic status setter — for transitions that don't need explicit stock logic
// (e.g., pending → processing → out_for_delivery → delivered).
// For cancellation, use cancelSale() instead; this path is a safety fallback.

export const updateSaleStatus = async (id, status, userId) => {
  // Safety fallback: if someone calls updateSaleStatus('cancelled'), handle stock
  if (status === 'cancelled') {
    return cancelSale(id, userId, 'Status updated to cancelled');
  }

  await updateDoc(doc(salesRef, id), { status, updatedAt: serverTimestamp() });
  await logActivity({
    type: 'sale_status_updated',
    description: `Sale status updated to ${status}`,
    userId,
    meta: { saleId: id, status },
  });
};

// ─── Update Payment Status ────────────────────────────────────────────────────

export const updatePaymentStatus = async (id, paymentStatus, userId) => {
  await updateDoc(doc(salesRef, id), { paymentStatus, updatedAt: serverTimestamp() });
  await logActivity({
    type: 'sale_payment_updated',
    description: `Sale payment status updated to ${paymentStatus}`,
    userId,
    meta: { saleId: id, paymentStatus },
  });
};
