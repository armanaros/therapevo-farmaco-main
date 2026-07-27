import { formatCurrency } from './formatters';

// --- Shared helpers -----------------------------------------------------------
const _fmt  = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const _cap  = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const _date = (v) => { const d = v?.toDate ? v.toDate() : v instanceof Date ? v : new Date(v); return d; };
const _origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

const _letterhead = (title, ref, dateStr, timeStr) => `
  <div style="display:flex;align-items:center;gap:12px;padding-bottom:12px;border-bottom:3px solid #16a34a">
    <img src="${_origin()}/logo.jpg" style="height:64px;width:auto;object-fit:contain;flex-shrink:0" alt="Logo"/>
    <div style="flex:1">
      <div style="font-size:17px;font-weight:800;color:#16a34a;line-height:1">Therapevo Farmaco</div>
      <div style="font-size:9px;color:#4b6b5d;margin-top:3px">Integrated Pharmaceutical Distribution Management System</div>
      <div style="font-size:9px;color:#6b7280;margin-top:2px">0041 J.P. Rizal, San Pedro, Sasmuan, Philippines 2004</div>
      <div style="font-size:9px;color:#6b7280">therapevo.farmaco@gmail.com</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:10px;font-weight:800;letter-spacing:1px;color:#374151;text-transform:uppercase">${title}</div>
      <div style="font-size:13px;font-weight:800;color:#16a34a;margin-top:2px">#${ref}</div>
      <div style="font-size:9px;color:#6b7280;margin-top:2px">${dateStr}</div>
      <div style="font-size:9px;color:#6b7280">${timeStr}</div>
    </div>
  </div>`;

const _wrapDoc = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#fff;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#111827}
    .wrap{width:160mm;margin:0 auto;padding:12mm 12mm 10mm}
    .divider{border:none;border-top:1px solid #e5e7eb;margin:10px 0}
    .dashed{border:none;border-top:1.5px dashed #d1d5db;margin:10px 0}
    .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;margin-bottom:1px}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .wrap{padding:8mm 10mm}
    }
  </style>
</head>
<body>
<div class="wrap">
${bodyHtml}
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

const _openWindow = (html) => {
  const win = window.open('', '_blank', 'width=680,height=900');
  if (!win) return;
  win.document.write(html);
  win.document.close();
};

// --- Sales Receipt ------------------------------------------------------------
export const printSaleReceipt = (sale) => {
  const now       = _date(sale.createdAt || new Date());
  const dateStr   = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr   = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const txn       = sale.transactionNumber || sale.id || '\u2014';
  const isCredit  = sale.paymentMethod === 'credit_term';
  const isPending = sale.status === 'pending_approval';

  const statusBg    = isPending ? '#fef3c7' : isCredit ? '#eff6ff' : '#f0fdf4';
  const statusColor = isPending ? '#92400e' : isCredit ? '#1e40af' : '#166534';
  const statusBdr   = isPending ? '#f59e0b' : isCredit ? '#3b82f6' : '#16a34a';
  const statusLabel = isPending ? 'PENDING APPROVAL' : isCredit ? 'CREDIT TERM' : (sale.status || 'COMPLETED').toUpperCase().replace(/_/g, ' ');

  const itemRows = (sale.items || []).map((item) => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #f1f5f9;vertical-align:top">
        <div style="font-size:11.5px;font-weight:600;color:#111827">${item.productName || item.name || '\u2014'}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:1px">
          ${item.quantity} ${item.unit || 'pc'} &times; ${_fmt(item.unitPrice)}
          ${item.lotNumber   ? ` &bull; Lot: ${item.lotNumber}` : ''}
          ${item.batchNumber ? ` &bull; Batch: ${item.batchNumber}` : ''}
        </div>
      </td>
      <td style="padding:7px 0 7px 12px;text-align:right;vertical-align:top;font-size:12px;font-weight:700;color:#111827;border-bottom:1px solid #f1f5f9;white-space:nowrap">
        ${_fmt(item.totalPrice ?? (item.quantity * item.unitPrice))}
      </td>
    </tr>`).join('');

  const body = `
  ${_letterhead('Sales Receipt', txn, dateStr, timeStr)}

  <div style="margin:10px 0;padding:6px 12px;border-radius:6px;background:${statusBg};border:1px solid ${statusBdr};display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:10px;font-weight:800;letter-spacing:.5px;color:${statusColor}">${statusLabel}</span>
    <span style="font-size:9.5px;color:${statusColor};opacity:.8">${_cap(sale.orderType) || 'Walk-in'}</span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:10.5px;margin-bottom:10px">
    <div><div class="lbl">Customer</div><div style="font-size:11px;font-weight:700;color:#111827">${sale.customerName || 'Walk-in Customer'}</div></div>
    <div><div class="lbl">Payment Method</div><div style="font-size:11px;font-weight:700;color:#111827">${_cap(sale.paymentMethod) || 'Cash'}</div></div>
    ${sale.customerPhone ? `<div><div class="lbl">Phone</div><div style="font-size:11px;color:#374151">${sale.customerPhone}</div></div>` : '<div></div>'}
    ${sale.customerAddress ? `<div style="grid-column:span 2"><div class="lbl">Address</div><div style="font-size:11px;color:#374151">${sale.customerAddress}</div></div>` : ''}
  </div>

  <hr class="divider"/>

  <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;display:flex;justify-content:space-between;padding-bottom:4px">
    <span>Product / Description</span><span>Amount</span>
  </div>
  <table style="width:100%;border-collapse:collapse"><tbody>${itemRows}</tbody></table>

  <div style="margin-top:6px;padding:10px 12px;background:#f8fafc;border-radius:6px;border:1px solid #e5e7eb">
    <div style="display:flex;justify-content:space-between;font-size:10.5px;color:#6b7280;margin-bottom:4px"><span>Subtotal</span><span>${_fmt(sale.subtotal)}</span></div>
    ${(sale.discount || 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#16a34a;margin-bottom:4px"><span>Discount</span><span>&minus; ${_fmt(sale.discount)}</span></div>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:6px 0"/>
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:12px;font-weight:800;color:#111827">TOTAL DUE</span>
      <span style="font-size:18px;font-weight:800;color:#16a34a">${_fmt(sale.total)}</span>
    </div>
  </div>

  ${isCredit ? `<div style="margin-top:8px;padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 4px 4px 0;font-size:10px;color:#78350f"><strong>Credit Term</strong> &mdash; Balance is due as per agreed payment terms.${sale.notes ? `<br/><em>${sale.notes}</em>` : ''}</div>` : ''}
  ${isPending ? `<div style="margin-top:8px;padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 4px 4px 0;font-size:10px;color:#78350f"><strong>Pending Approval</strong> &mdash; Awaiting manager approval before fulfillment.</div>` : ''}
  ${sale.notes && !isCredit ? `<div style="margin-top:8px;padding:7px 10px;background:#f8fafc;border-radius:4px;font-size:10px;color:#374151;border:1px solid #e5e7eb"><strong>Notes:</strong> ${sale.notes}</div>` : ''}

  <div style="display:flex;gap:24px;margin-top:20px">
    <div style="flex:1;text-align:center"><div style="height:32px"></div><div style="border-top:1.5px solid #374151;padding-top:4px;font-size:9px;color:#6b7280">Issued by / Authorized Signatory</div></div>
    <div style="flex:1;text-align:center"><div style="height:32px"></div><div style="border-top:1.5px solid #374151;padding-top:4px;font-size:9px;color:#6b7280">Received by / Customer Signature</div></div>
  </div>

  <hr class="dashed" style="margin-top:14px"/>
  <div style="text-align:center;font-size:9px;color:#9ca3af;line-height:1.7">
    <div style="font-weight:700;color:#6b7280">Thank you for your business with Therapevo Farmaco!</div>
    <div>This is a system-generated official sales receipt.</div>
    <div>For inquiries: therapevo.farmaco@gmail.com</div>
    <div style="margin-top:3px;font-size:8.5px">Transaction #${txn} &nbsp;&bull;&nbsp; ${dateStr} ${timeStr}</div>
  </div>`;

  _openWindow(_wrapDoc(`Receipt \u2014 ${txn}`, body));
};

// --- Payment Receipt (AR) -----------------------------------------------------
export const printPaymentReceipt = (arRecord, payment) => {
  const now       = payment?.createdAt ? _date(payment.createdAt) : new Date();
  const dateStr   = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr   = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const receiptNo = (payment?.id || `PAY-${Date.now()}`).slice(-10).toUpperCase();

  const totalInvoice = Number(arRecord?.amount || 0);
  const thisPay      = Number(payment?.amount || 0);
  const newPaid      = Number(arRecord?.amountPaid || 0);
  const prevPaid     = Math.max(0, newPaid - thisPay);
  const newBalance   = Math.max(0, totalInvoice - newPaid);
  const isFullyPaid  = newBalance <= 0;

  const body = `
  ${_letterhead('Payment Receipt', receiptNo, dateStr, timeStr)}

  <div style="margin:10px 0;padding:6px 12px;border-radius:6px;background:${isFullyPaid ? '#f0fdf4' : '#eff6ff'};border:1px solid ${isFullyPaid ? '#16a34a' : '#3b82f6'};display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:10px;font-weight:800;letter-spacing:.5px;color:${isFullyPaid ? '#166534' : '#1e40af'}">${isFullyPaid ? 'FULLY SETTLED' : 'PARTIAL PAYMENT'}</span>
    <span style="font-size:9.5px;color:${isFullyPaid ? '#166534' : '#1e40af'};opacity:.8">Invoice #${arRecord?.invoiceNumber || '\u2014'}</span>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:12px">
    <div><div class="lbl">Customer</div><div style="font-size:12px;font-weight:700;color:#111827">${arRecord?.customerName || '\u2014'}</div></div>
    <div><div class="lbl">Payment Method</div><div style="font-size:12px;font-weight:700;color:#111827">${_cap(payment?.paymentMethod) || 'Cash'}</div></div>
    ${arRecord?.customerPhone ? `<div><div class="lbl">Phone</div><div style="font-size:11px;color:#374151">${arRecord.customerPhone}</div></div>` : '<div></div>'}
    ${payment?.reference ? `<div><div class="lbl">Reference / Check #</div><div style="font-size:11px;color:#374151">${payment.reference}</div></div>` : '<div></div>'}
    ${arRecord?.customerAddress ? `<div style="grid-column:span 2"><div class="lbl">Address</div><div style="font-size:11px;color:#374151">${arRecord.customerAddress}</div></div>` : ''}
  </div>

  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid #f3f4f6">
      <span style="color:#6b7280">Total Invoice Amount</span>
      <span style="color:#374151;font-weight:600">${_fmt(totalInvoice)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid #f3f4f6">
      <span style="color:#6b7280">Previously Paid</span>
      <span style="color:#374151;font-weight:600">${_fmt(prevPaid)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-top:2px solid #16a34a;margin-top:4px">
      <span style="font-size:13px;font-weight:800;color:#111827">PAYMENT RECEIVED</span>
      <span style="font-size:20px;font-weight:800;color:#16a34a">${_fmt(thisPay)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-top:1px solid #e5e7eb;margin-top:2px">
      <span style="font-size:11px;font-weight:700;color:${isFullyPaid ? '#166534' : '#dc2626'}">Remaining Balance</span>
      <span style="font-size:14px;font-weight:800;color:${isFullyPaid ? '#16a34a' : '#dc2626'}">${isFullyPaid ? 'FULLY PAID' : _fmt(newBalance)}</span>
    </div>
  </div>

  ${payment?.notes ? `<div style="padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 4px 4px 0;font-size:10px;color:#78350f;margin-bottom:12px"><strong>Notes:</strong> ${payment.notes}</div>` : ''}

  <div style="display:flex;gap:24px;margin-top:20px">
    <div style="flex:1;text-align:center"><div style="height:32px"></div><div style="border-top:1.5px solid #374151;padding-top:4px;font-size:9px;color:#6b7280">Received by / Cashier</div></div>
    <div style="flex:1;text-align:center"><div style="height:32px"></div><div style="border-top:1.5px solid #374151;padding-top:4px;font-size:9px;color:#6b7280">Acknowledged by / Customer</div></div>
  </div>

  <hr class="dashed" style="margin-top:14px"/>
  <div style="text-align:center;font-size:9px;color:#9ca3af;line-height:1.7">
    <div style="font-weight:700;color:#6b7280">Thank you for your payment \u2014 Therapevo Farmaco</div>
    <div>This is a system-generated official payment receipt.</div>
    <div>For inquiries: therapevo.farmaco@gmail.com</div>
    <div style="margin-top:3px;font-size:8.5px">Receipt #${receiptNo} &nbsp;&bull;&nbsp; ${dateStr} ${timeStr}</div>
  </div>`;

  _openWindow(_wrapDoc(`Payment Receipt \u2014 ${receiptNo}`, body));
};

// --- Legacy receipt (POS / orders) -------------------------------------------
export const printReceipt = (order) => {
  const html = generateReceiptHTML(order);
  const win = window.open('', '_blank', 'width=360,height=600,toolbar=0,scrollbars=0,status=0');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Receipt #${order.orderNumber}</title>
  <style>@media print{body{margin:0}}body{margin:0;background:#fff}</style>
</head>
<body>
${html}
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}<\/script>
</body>
</html>`);
  win.document.close();
};

export const generateReceiptHTML = (order) => {
  const items = order.items || [];
  const rows  = items.map((item) =>
    `<tr>
      <td style="text-align:left;padding:2px 0">${item.quantity}x ${item.name}</td>
      <td style="text-align:right;padding:2px 0">${formatCurrency(item.totalPrice || item.unitPrice * item.quantity)}</td>
    </tr>`).join('');

  return `<div style="font-family:monospace;font-size:12px;width:280px;padding:10px">
    <div style="text-align:center;margin-bottom:8px">
      <strong style="font-size:14px">THERAPEVO FARMACO</strong><br/>
      <span style="font-size:10px">Pharma and Medical Supplies Trading</span><br/>
      <span style="font-size:10px">Official Sales Receipt</span>
    </div>
    <hr style="border:none;border-top:1px dashed #000"/>
    <div style="margin:4px 0">
      <div>Order: #${String(order.orderNumber || '').padStart(4, '0')}</div>
      <div>Type: ${order.orderType || 'walk-in'}</div>
      ${order.customerName ? `<div>Customer: ${order.customerName}</div>` : ''}
      <div>Date: ${new Date(order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt).toLocaleString()}</div>
    </div>
    <hr style="border:none;border-top:1px dashed #000"/>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <hr style="border:none;border-top:1px dashed #000"/>
    <div style="text-align:right">
      <div>Subtotal: ${formatCurrency(order.subtotal)}</div>
      ${order.discount ? `<div>Discount: -${formatCurrency(order.discount)}</div>` : ''}
      <div style="font-size:14px;font-weight:bold;margin-top:4px">Total: ${formatCurrency(order.total)}</div>
    </div>
    <div style="margin-top:4px">Payment: ${order.paymentMethod || 'cash'}</div>
    <hr style="border:none;border-top:1px dashed #000"/>
    <div style="text-align:center;font-size:10px;margin-top:8px">Thank you for your purchase!</div>
  </div>`;
};
