import { collection, getDocs, writeBatch, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { COLLECTIONS } from '@/config/constants';

// ─── Serialization helpers (Firestore Timestamps → plain objects) ─────────────
const serializeValue = (val) => {
  if (val === null || val === undefined) return val;
  if (typeof val?.toDate === 'function') {
    // Firestore Timestamp
    return { _type: 'Timestamp', _s: val.seconds, _ns: val.nanoseconds };
  }
  if (val instanceof Date) {
    return { _type: 'Date', _iso: val.toISOString() };
  }
  if (Array.isArray(val)) return val.map(serializeValue);
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = serializeValue(v);
    return out;
  }
  return val;
};

const deserializeValue = (val) => {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && val._type === 'Timestamp') {
    return new Timestamp(val._s, val._ns);
  }
  if (typeof val === 'object' && val._type === 'Date') {
    return new Date(val._iso);
  }
  if (Array.isArray(val)) return val.map(deserializeValue);
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = deserializeValue(v);
    return out;
  }
  return val;
};

const deleteCollection = async (collectionName) => {
  const ref = collection(db, collectionName);
  const snapshot = await getDocs(ref);
  if (snapshot.empty) return 0;

  // Firestore batches support max 500 operations
  let count = 0;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(doc(db, collectionName, docSnap.id));
    batchCount++;
    count++;
    if (batchCount === 500) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();
  return count;
};

/**
 * Permanently delete selected collections from Firestore.
 * Uses the same EXPORT_SECTIONS items so all pharma collections are supported.
 *
 * @param {string[]} selectedKeys - collection keys to delete
 * @param {Function} onProgress - optional callback({ current, total, label })
 * @returns {{ [key]: number }} - count of documents deleted per key
 */
export const clearSelectedData = async (selectedKeys, onProgress) => {
  const allItems = allExportSectionItems();
  const items = allItems.filter((s) => selectedKeys.includes(s.key));
  const results = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.({ current: i + 1, total: items.length, label: item.label });
    results[item.key] = await deleteCollection(item.collection);
  }

  return results;
};

// ─── Export / Import ─────────────────────────────────────────────────────────

export const EXPORT_SECTIONS = [
  {
    group: 'Products & Catalog',
    items: [
      { key: 'products',           label: 'Drug Catalog (Products)',     collection: COLLECTIONS.PRODUCTS },
      { key: 'product_categories', label: 'Product Categories',          collection: COLLECTIONS.PRODUCT_CATEGORIES },
    ],
  },
  {
    group: 'Inventory',
    items: [
      { key: 'inventory',           label: 'Inventory Stock',            collection: COLLECTIONS.INVENTORY },
      { key: 'inventory_movements', label: 'Inventory Movements',        collection: COLLECTIONS.INVENTORY_MOVEMENTS },
      { key: 'batches',             label: 'Batches / Lot Numbers',      collection: COLLECTIONS.BATCHES },
      { key: 'warehouses',          label: 'Warehouses',                 collection: COLLECTIONS.WAREHOUSES },
    ],
  },
  {
    group: 'Sales & Deliveries',
    items: [
      { key: 'sales_transactions',  label: 'Sales Transactions',         collection: COLLECTIONS.SALES_TRANSACTIONS },
      { key: 'sale_items',          label: 'Sale Items',                 collection: COLLECTIONS.SALE_ITEMS },
      { key: 'deliveries',          label: 'Deliveries',                 collection: COLLECTIONS.DELIVERIES },
      { key: 'delivery_items',      label: 'Delivery Items',             collection: COLLECTIONS.DELIVERY_ITEMS },
      { key: 'purchase_orders',     label: 'Purchase Orders',            collection: COLLECTIONS.PURCHASE_ORDERS },
    ],
  },
  {
    group: 'Finance',
    items: [
      { key: 'expenses',            label: 'Expenses',                   collection: COLLECTIONS.EXPENSES },
      { key: 'accounts_receivable', label: 'Accounts Receivable',        collection: COLLECTIONS.ACCOUNTS_RECEIVABLE },
      { key: 'ar_payments',         label: 'AR Payments',                collection: COLLECTIONS.AR_PAYMENTS },
    ],
  },
  {
    group: 'Medical Representatives',
    items: [
      { key: 'medical_reps',        label: 'Medical Reps',               collection: COLLECTIONS.MEDICAL_REPS },
      { key: 'rep_assignments',     label: 'Rep Assignments',            collection: COLLECTIONS.REP_ASSIGNMENTS },
    ],
  },
];

/** Flatten all EXPORT_SECTIONS items into a single array */
export const allExportSectionItems = () =>
  EXPORT_SECTIONS.flatMap((g) => g.items);

/** @deprecated Use EXPORT_SECTIONS / allExportSectionItems instead */
export const DATA_SECTIONS = EXPORT_SECTIONS.flatMap((g) => g.items);

/** @deprecated Use clearSelectedData instead */
export const deleteSelectedData = (selectedKeys) => clearSelectedData(selectedKeys);

/**
 * Export selected collections from Firestore to a serializable JS object.
 * @param {string[]} selectedKeys - collection keys to export
 * @param {Function} onProgress - optional callback({ current, total, label })
 */
export const exportData = async (selectedKeys, onProgress) => {
  const allItems = allExportSectionItems();
  const items = allItems.filter((s) => selectedKeys.includes(s.key));
  const output = {
    version: '1.0',
    system: 'Therapevo Farmaco',
    exportedAt: new Date().toISOString(),
    meta: {},
    data: {},
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.({ current: i + 1, total: items.length, label: item.label });
    const snap = await getDocs(collection(db, item.collection));
    output.data[item.key] = snap.docs.map((d) => ({
      _id: d.id,
      ...serializeValue(d.data()),
    }));
    output.meta[item.key] = { count: snap.docs.length };
  }

  return output;
};

/**
 * Import data from a previously exported JSON object into Firestore.
 * Uses setDoc with the original document ID, so existing documents with the
 * same ID are overwritten (merge: false).
 *
 * @param {object} exportedJson - parsed JSON from exportData
 * @param {string[]} selectedKeys - which collections to restore
 * @param {Function} onProgress - optional callback({ current, total, label })
 * @returns {{ [key]: number }} - count of documents written per key
 */
export const importData = async (exportedJson, selectedKeys, onProgress) => {
  if (!exportedJson?.data) throw new Error('Invalid backup file format.');

  const results = {};
  const keys = selectedKeys.filter((k) => exportedJson.data[k]);
  const allItems = allExportSectionItems();

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const item = allItems.find((s) => s.key === key);
    if (!item) continue;

    onProgress?.({ current: i + 1, total: keys.length, label: item.label });
    const docs = exportedJson.data[key] || [];

    // Firestore batch supports max 500 ops
    let batch = writeBatch(db);
    let batchCount = 0;
    let written = 0;

    for (const record of docs) {
      const { _id, ...fields } = record;
      const docRef = _id
        ? doc(db, item.collection, _id)
        : doc(collection(db, item.collection));
      batch.set(docRef, deserializeValue(fields));
      batchCount++;
      written++;

      if (batchCount === 499) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();
    results[key] = written;
  }

  return results;
};
