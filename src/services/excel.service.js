import * as XLSX from 'xlsx';
import { collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { allExportSectionItems } from './datamanagement.service';

const isTimestampKey = (k) =>
  ['At', 'Date', 'Time', 'On'].some((s) => k.endsWith(s)) ||
  ['timestamp', 'date', 'time'].includes(k.toLowerCase());

const formatCell = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString().slice(0, 19).replace('T', ' ');
  }
  if (val instanceof Date) {
    return val.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length ? JSON.stringify(val) : '';
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
};

const flattenDoc = ({ _id, ...fields }) => {
  const regularKeys = Object.keys(fields).filter((k) => !isTimestampKey(k)).sort();
  const tsKeys = Object.keys(fields).filter((k) => isTimestampKey(k)).sort();
  const row = { id: _id ?? '' };
  for (const k of [...regularKeys, ...tsKeys]) {
    row[k] = formatCell(fields[k]);
  }
  return row;
};

const autoFitCols = (ws, rows) => {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  ws['!cols'] = keys.map((k) => ({
    wch: Math.min(
      60,
      Math.max(k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 1))
    ),
  }));
};

const parseCell = (val) => {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) {
      const d = new Date(val.replace(' ', 'T') + 'Z');
      if (!isNaN(d.getTime())) return Timestamp.fromDate(d);
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if ((val.startsWith('[') || val.startsWith('{')) && (val.endsWith(']') || val.endsWith('}'))) {
      try { return JSON.parse(val); } catch { /* keep as string */ }
    }
  }
  return val;
};

export const exportToExcel = async (selectedKeys, onProgress) => {
  const allItems = allExportSectionItems();
  const items = allItems.filter((s) => selectedKeys.includes(s.key));

  const collected = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.({ current: i + 1, total: items.length, label: item.label });
    const snap = await getDocs(collection(db, item.collection));
    const rows = snap.docs.map((d) => flattenDoc({ _id: d.id, ...d.data() }));
    collected.push({ item, rows });
  }

  const wb = XLSX.utils.book_new();

  const now = new Date();
  const infoAoa = [
    ['THERAPEVO FARMACO \u2014 DATA EXPORT'],
    [],
    ['Exported At (Local)', now.toLocaleString()],
    ['Exported At (UTC)', now.toISOString()],
    ['System', 'Therapevo Farmaco'],
    ['Format Version', '1.0'],
    ['Note', 'All datetime values are stored in UTC (YYYY-MM-DD HH:mm:ss)'],
    [],
    ['Sheet Name', 'Collection', 'Records'],
    ...collected.map(({ item, rows }) => [item.key, item.label, rows.length]),
  ];
  const infoWs = XLSX.utils.aoa_to_sheet(infoAoa);
  infoWs['!cols'] = [{ wch: 28 }, { wch: 38 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, infoWs, '_Info');

  for (const { item, rows } of collected) {
    const sheetName = item.key.slice(0, 31);
    if (rows.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([
        ['id'],
        ['(this collection has no records)'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    } else {
      const ws = XLSX.utils.json_to_sheet(rows);
      autoFitCols(ws, rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const parseExcelFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const result = { system: 'Therapevo Farmaco', exportedAt: null, meta: {}, data: {} };

        if (wb.SheetNames.includes('_Info')) {
          const infoRows = XLSX.utils.sheet_to_json(wb.Sheets['_Info'], { header: 1 });
          for (const row of infoRows) {
            if (Array.isArray(row) && row[0] === 'Exported At (UTC)') {
              result.exportedAt = String(row[1] || '');
            }
          }
        }

        for (const name of wb.SheetNames) {
          if (name === '_Info') continue;
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
          if (!rows.length) continue;
          const firstRow = rows[0];
          if (Object.keys(firstRow).length === 1 && String(Object.values(firstRow)[0]).startsWith('(')) continue;
          result.data[name] = rows;
          result.meta[name] = { count: rows.length };
        }

        if (!Object.keys(result.data).length) {
          throw new Error('No data sheets found. Make sure this is a Therapevo Farmaco Excel backup.');
        }
        resolve(result);
      } catch (err) {
        reject(new Error(`Could not parse Excel file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file.'));
    reader.readAsArrayBuffer(file);
  });

export const importFromExcel = async (parsedData, selectedKeys, onProgress) => {
  const results = {};
  const keys = selectedKeys.filter((k) => parsedData.data[k]);
  const allItems = allExportSectionItems();

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const item = allItems.find((s) => s.key === key);
    if (!item) continue;

    onProgress?.({ current: i + 1, total: keys.length, label: item.label });
    const rows = parsedData.data[key] || [];

    let batch = writeBatch(db);
    let batchCount = 0;
    let written = 0;

    for (const row of rows) {
      const { id: docId, ...fields } = row;
      const cleaned = {};
      for (const [k, v] of Object.entries(fields)) {
        const parsed = parseCell(v);
        if (parsed !== null && parsed !== undefined) cleaned[k] = parsed;
      }

      const docRef =
        docId && String(docId).trim()
          ? doc(db, item.collection, String(docId).trim())
          : doc(collection(db, item.collection));

      batch.set(docRef, cleaned);
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
