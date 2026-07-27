import {
  collection,
  doc,
  onSnapshot,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  increment,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';
import { logActivity } from './activity.service';

const productsRef  = collection(db, COLLECTIONS.PRODUCTS);
const menuItemsRef = productsRef;
const movementsRef = collection(db, COLLECTIONS.INVENTORY_MOVEMENTS);

export const subscribeToAllStockItems = (callback) => {
  return onSnapshot(productsRef, (snapshot) => {
    const items = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => item.isActive !== false)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    callback(items);
  });
};

export const subscribeToLowStockItems = (callback) => {
  return onSnapshot(productsRef, (snapshot) => {
    const items = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => {
        const stock     = item.stockLevel  ?? 0;
        const threshold = item.reorderLevel ?? item.lowStockThreshold ?? 5;
        return stock <= threshold && item.isActive !== false;
      })
      .sort((a, b) => (a.stockLevel ?? 0) - (b.stockLevel ?? 0));
    callback(items);
  });
};

export const subscribeToStockMovements = (callback, maxRows = 100) => {
  const q = query(movementsRef, orderBy('createdAt', 'desc'), limit(maxRows));
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
};

export const getMovementsForProduct = async (productId, maxRows = 50) => {
  const q = query(
    movementsRef,
    where('productId', '==', productId),
    orderBy('createdAt', 'desc'),
    limit(maxRows)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const adjustStock = async ({ productId, productName, adjustmentQty, type = 'manual_adjustment', reason, userId }) => {
  const productRef = doc(productsRef, productId);
  await updateDoc(productRef, { stockLevel: increment(adjustmentQty), updatedAt: serverTimestamp() });
  await addDoc(movementsRef, {
    productId, productName: productName || '', type,
    quantity: Math.abs(adjustmentQty), direction: adjustmentQty >= 0 ? 'in' : 'out',
    saleId: null, reason: reason || '', performedBy: userId || '', createdAt: serverTimestamp(),
  });
  await logActivity({
    type: 'stock_adjusted',
    description: `Stock ${adjustmentQty >= 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustmentQty)} for ${productName}`,
    userId, meta: { productId, adjustmentQty, reason },
  });
};

export const receiveStock = async (items, userId, referenceNote = '') => {
  const batch = writeBatch(db);
  for (const item of items) {
    if (!item.productId || !item.quantity) continue;
    const productRef = doc(productsRef, item.productId);
    batch.update(productRef, { stockLevel: increment(Number(item.quantity)), isAvailable: true, updatedAt: serverTimestamp() });
    const movRef = doc(movementsRef);
    batch.set(movRef, {
      productId: item.productId, productName: item.productName || '', type: 'stock_received',
      quantity: Number(item.quantity), direction: 'in', saleId: null,
      reason: referenceNote || 'Stock received', performedBy: userId || '', createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
  await logActivity({ type: 'stock_received', description: `Stock received for ${items.length} product(s)`, userId, meta: { itemCount: items.length, referenceNote } });
};
