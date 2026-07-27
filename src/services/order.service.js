import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  runTransaction,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';
import logger from '@/utils/logger';
import { softDelete } from './softDelete.service';
import { logActivity } from './activity.service';

const ordersRef = collection(db, COLLECTIONS.ORDERS);
const orderItemsRef = collection(db, COLLECTIONS.ORDER_ITEMS);
const menuItemsRef = collection(db, COLLECTIONS.MENU_ITEMS);

const counterRef = doc(db, 'system_counters', 'orders');

const getNextOrderNumber = async () => {
  return runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = counterSnap.exists() ? (counterSnap.data().current || 0) : 0;
    const next = current + 1;
    transaction.set(counterRef, { current: next }, { merge: true });
    return String(next);
  });
};

export const createOrder = async (restaurantId, orderData, items) => {
  let resolvedRestaurantId = restaurantId;
  let resolvedOrderData = orderData;
  let resolvedItems = items;
  if (typeof restaurantId === 'object' && !Array.isArray(restaurantId)) {
    resolvedOrderData = restaurantId;
    resolvedItems = orderData;
    resolvedRestaurantId = restaurantId.restaurantId || '';
  }
  if (!Array.isArray(resolvedItems)) throw new Error('items must be an array');
  const batch = writeBatch(db);
  const orderNumber = await getNextOrderNumber();
  const affectedItemIds = [];
  const orderRef = doc(ordersRef);
  batch.set(orderRef, {
    restaurantId: resolvedRestaurantId || null,
    orderNumber,
    employeeId: resolvedOrderData.employeeId || '',
    customerName: resolvedOrderData.customerName || '',
    customerPhone: resolvedOrderData.customerPhone || '',
    orderType: resolvedOrderData.orderType || 'dine-in',
    tableNumber: resolvedOrderData.tableNumber || '',
    deliveryAddress: resolvedOrderData.deliveryAddress || '',
    deliveryPersonId: null,
    subtotal: resolvedOrderData.subtotal || 0,
    tax: resolvedOrderData.tax || 0,
    discount: resolvedOrderData.discount || 0,
    total: resolvedOrderData.total || 0,
    paymentMethod: resolvedOrderData.paymentMethod || 'cash',
    paymentStatus: resolvedOrderData.paymentStatus || 'pending',
    status: 'pending',
    notes: resolvedOrderData.notes || '',
    coupon: resolvedOrderData.coupon || null,
    items: resolvedItems.map((it) => ({
      menuItemId: it.menuItemId, name: it.name, quantity: it.quantity,
      unitPrice: it.unitPrice, totalPrice: it.unitPrice * it.quantity,
      specialInstructions: it.specialInstructions || '',
      categoryId: it.categoryId || '', categoryName: it.categoryName || '',
    })),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null,
  });
  resolvedItems.forEach((item) => {
    const itemRef = doc(orderItemsRef);
    batch.set(itemRef, {
      restaurantId: resolvedRestaurantId || null, orderId: orderRef.id,
      menuItemId: item.menuItemId, name: item.name, quantity: item.quantity,
      unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity,
      specialInstructions: item.specialInstructions || '',
      categoryId: item.categoryId || '', categoryName: item.categoryName || '',
      createdAt: serverTimestamp(), deletedAt: null,
    });
    if (item.menuItemId) {
      batch.update(doc(menuItemsRef, item.menuItemId), { stockLevel: increment(-(Number(item.quantity) || 0)), updatedAt: serverTimestamp() });
      affectedItemIds.push(item.menuItemId);
    }
  });
  await batch.commit();
  const uniqueIds = [...new Set(affectedItemIds)];
  if (uniqueIds.length > 0) {
    Promise.all(uniqueIds.map((id) => getDoc(doc(menuItemsRef, id))))
      .then((snaps) => {
        const postBatch = writeBatch(db);
        let needsCommit = false;
        snaps.forEach((snap) => {
          if (snap.exists() && (snap.data().stockLevel || 0) <= 0 && snap.data().isAvailable !== false) {
            postBatch.update(doc(menuItemsRef, snap.id), { isAvailable: false, updatedAt: serverTimestamp() });
            needsCommit = true;
          }
        });
        if (needsCommit) return postBatch.commit();
      })
      .catch((err) => logger.warn('Post-order stock check failed:', err));
  }
  logger.info('Order created:', orderNumber);
  return { id: orderRef.id, orderNumber };
};

export const createPublicOrder = async (orderData) => {
  const orderNumber = await getNextOrderNumber();
  const docRef = await addDoc(ordersRef, {
    restaurantId: orderData.restaurantId || null, orderNumber,
    employeeId: 'public', customerName: orderData.customerName || '',
    customerPhone: orderData.customerPhone || '', orderType: orderData.orderType || 'takeaway',
    deliveryAddress: orderData.deliveryAddress || '',
    subtotal: orderData.subtotal || 0, tax: orderData.tax || 0,
    discount: orderData.discount || 0, total: orderData.total || 0,
    paymentMethod: orderData.paymentMethod || 'cash', paymentStatus: 'pending',
    status: 'pending', notes: orderData.notes || '', coupon: orderData.coupon || null,
    items: orderData.items || [], deletedAt: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return { id: docRef.id, orderNumber, total: orderData.total, status: 'pending' };
};

export const getOrderById = async (orderId) => {
  const snap = await getDoc(doc(ordersRef, orderId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const updateOrder = async (orderId, data) => {
  await updateDoc(doc(ordersRef, orderId), { ...data, updatedAt: serverTimestamp() });
};

export const updateOrderStatus = async (orderId, status) => {
  const update = { status, updatedAt: serverTimestamp() };
  if (status === 'served' || status === 'completed') update.completedAt = serverTimestamp();
  else if (status === 'delivered') update.deliveredAt = serverTimestamp();
  else if (status === 'out_for_delivery') update.outForDeliveryAt = serverTimestamp();
  if (status === 'cancelled') {
    const orderSnap = await getDoc(doc(ordersRef, orderId));
    if (orderSnap.exists()) {
      const order = orderSnap.data();
      if (!['served', 'completed', 'refunded'].includes(order.status) && order.items?.length) {
        const batch = writeBatch(db);
        order.items.forEach((item) => {
          if (item.menuItemId) batch.update(doc(menuItemsRef, item.menuItemId), { stockLevel: increment(Number(item.quantity) || 0), isAvailable: true, updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }
    }
  }
  await updateDoc(doc(ordersRef, orderId), update);
};

export const updatePaymentStatus = async (orderId, paymentStatus) => {
  await updateDoc(doc(ordersRef, orderId), { paymentStatus, updatedAt: serverTimestamp() });
};

export const deleteOrder = async (restaurantId, orderId, deletedBy, deletionReason = '') => {
  await softDelete(db, COLLECTIONS.ORDERS, orderId, deletedBy, deletionReason, restaurantId);
  await logActivity({ type: 'AUTH', action: 'DELETE', userId: deletedBy, details: `Order ${orderId} deleted` });
  logger.info(`Order ${orderId} deleted by ${deletedBy}`);
};

export const restoreOrder = async (orderId, restoredBy) => {
  await updateDoc(doc(ordersRef, orderId), { deletedAt: null, restoredAt: serverTimestamp(), restoredBy });
};

export const subscribeToOrders = (restaurantId, callback, daysBack = 30) => {
  let resolvedRestaurantId = restaurantId;
  let resolvedCallback = callback;
  let resolvedDaysBack = daysBack;
  if (typeof restaurantId === 'function') {
    resolvedCallback = restaurantId;
    resolvedDaysBack = typeof callback === 'number' ? callback : 30;
    resolvedRestaurantId = '';
  }
  if (typeof resolvedCallback !== 'function') throw new Error('callback is required');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - resolvedDaysBack);
  const q = resolvedRestaurantId ? query(ordersRef, where('restaurantId', '==', resolvedRestaurantId)) : ordersRef;
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((order) => !order.deletedAt)
      .filter((order) => { const createdAt = order.createdAt?.toDate?.(); if (!createdAt) return true; return createdAt >= cutoff; })
      .sort((a, b) => { const at = a.createdAt?.toDate?.() || new Date(); const bt = b.createdAt?.toDate?.() || new Date(); return bt - at; });
    resolvedCallback(orders);
  }, (error) => { console.error('[subscribeToOrders] Firestore error:', error); resolvedCallback([]); });
};

export const subscribeToOrderById = (orderId, callback) => {
  if (!orderId || typeof callback !== 'function') throw new Error('orderId and callback are required');
  return onSnapshot(doc(ordersRef, orderId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    else callback(null);
  });
};

export const getOrderByNumber = async (orderNumber) => {
  const q = query(ordersRef, where('orderNumber', '==', String(orderNumber)));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
};
