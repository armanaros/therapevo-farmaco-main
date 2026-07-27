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

export class InsufficientStockError extends Error {
  constructor(shortfalls) {
    super('Insufficient stock for one or more products');
    this.name = 'InsufficientStockError';
    this.shortfalls = shortfalls;
  }
}

const _logMovement = async (batch, { productId, productName, type, qty, before, after, saleId, transactionNumber, reason, userId }) => {
  const ref = doc(movementsRef);
  batch.set(ref, {
    productId,
    productName,
    type,
    quantity: qty,
    stockBefore: before,
    stockAfter: after,
    saleId:            saleId || null,
    transactionNumber: transactionNumber || null,
    reason:            reason || '',
    performedBy:       userId || '',
    createdAt:         serverTimestamp(),
  });
};

const _deductSaleStock = async (items, saleId, transactionNumber, userId) => {
  const shortfalls = [];

  await runTransaction(db, async (tx) => {
    const productRefs = items
      .filter((i) => i.productId)
      .map((i) => doc(productsRef, i.productId));

    const snaps = await Promise.all(productRefs.map((r) => tx.get(r)));

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

    snaps.forEach((snap, idx) => {
      const item   = items[idx];
      if (!snap.exists() || !item.productId) return;
      const before = snap.data().stockLevel ?? 0;
      const qty    = Number(item.quantity) || 0;
      const after  = before - qty;

      tx.update(snap.ref, {
        stockLevel: increment(-qty),
        ...(after <= 0 ? { isAvailable: false } : {}),
        updatedAt: serverTimestamp(),
      });

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

const getNextTransactionNumber = async () => {
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? snap.data().current || 0 : 0) + 1;
    tx.set(counterRef, { current: next }, { merge: true });
    return String(next).padStart(6, '0');
  });
};

export const createSale = async (data, items, userId, requireApproval = false, assignedManagerId = '', submittedByName = '') => {
  const transactionNumber = await getNextTransactionNumber();
  const isImmediate = !requireApproval;

  if (isImmediate) {
    await _deductSaleStock(items, null, transactionNumber, userId);
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
    stockDeducted:     isImmediate,
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

export const approveSale = async (saleId, userId, notes = '') => {
  const saleSnap = await getDoc(doc(salesRef, saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const sale = saleSnap.data();

  if (!sale.stockDeducted) {
    await _deductSaleStock(
      sale.items || [],
      saleId,
      sale.transactionNumber,
      userId
    );
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

export const rejectSale = async (saleId, userId, reason) => {
  const saleSnap = await getDoc(doc(salesRef, saleId));
  const sale = saleSnap.data() || {};

  if (sale.stockDeducted && sale.items?.length) {
    await _restoreSaleStock(
      sale.items,
      saleId,
      sale.transactionNumber,
      userId,
      `Sale #${sale.transactionNumber} rejected — stock restored. Reason: ${reason}`
    );
  }

  await updateDoc(doc(salesRef, saleId), {
    status:          'cancelled',
    paymentStatus:   'cancelled',
    stockDeducted:   false,
    rejectedBy:      userId,
    rejectedAt:      serverTimestamp(),
    rejectionReason: reason.trim(),
    updatedAt:       serverTimestamp(),
  });

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

export const cancelSale = async (saleId, userId, reason = '') => {
  const saleSnap = await getDoc(doc(salesRef, saleId));
  if (!saleSnap.exists()) throw new Error('Sale not found');
  const sale = saleSnap.data();

  const terminalStatuses = ['cancelled', 'returned'];
  if (terminalStatuses.includes(sale.status)) {
    throw new Error(`Sale is already ${sale.status} and cannot be cancelled again.`);
  }

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

export const updateSaleStatus = async (id, status, userId) => {
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

export const updatePaymentStatus = async (id, paymentStatus, userId) => {
  await updateDoc(doc(salesRef, id), { paymentStatus, updatedAt: serverTimestamp() });
  await logActivity({
    type: 'sale_payment_updated',
    description: `Sale payment status updated to ${paymentStatus}`,
    userId,
    meta: { saleId: id, paymentStatus },
  });
};
