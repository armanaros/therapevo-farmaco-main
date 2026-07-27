/**
 * Analytics Service - AI-powered business intelligence for Therapevo Farmaco
 * Analyzes orders, products, and cashier performance to detect trends and anomalies
 */

import { formatCurrency } from '@/utils/formatters';

export const calculateDailyMetrics = (orders = [], targetRevenue = 50000) => {
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const completedOrders = orders.filter((o) => o.status !== 'cancelled').length;
  const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;
  const percentOfTarget = targetRevenue > 0 ? (totalRevenue / targetRevenue) * 100 : 0;

  return {
    totalRevenue,
    orderCount: completedOrders,
    avgOrderValue,
    targetRevenue,
    percentOfTarget,
    trending: totalRevenue >= targetRevenue * 0.75 ? 'up' : totalRevenue >= targetRevenue * 0.5 ? 'neutral' : 'down',
  };
};

export const calculateHourlyTrends = (orders = []) => {
  const hourlyData = {};
  for (let h = 0; h < 24; h++) {
    hourlyData[h] = { revenue: 0, orderCount: 0 };
  }
  orders.forEach((order) => {
    if (order.status === 'cancelled' || !order.createdAt) return;
    const date = order.createdAt?.toDate?.() || new Date(order.createdAt);
    const hour = date.getHours();
    hourlyData[hour].revenue += order.total || 0;
    hourlyData[hour].orderCount += 1;
  });
  return Object.entries(hourlyData)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      revenue: data.revenue,
      orderCount: data.orderCount,
      avgOrderValue: data.orderCount > 0 ? data.revenue / data.orderCount : 0,
      label: `${String(hour).padStart(2, '0')}:00`,
    }))
    .filter((h) => h.orderCount > 0 || h.hour === 0);
};

export const analyzeFoodPerformance = (orders = [], menuItems = []) => {
  const itemMap = new Map(menuItems.map((m) => [m.id, m]));
  const foodData = {};
  orders.forEach((order) => {
    if (order.status === 'cancelled' || !order.items) return;
    order.items.forEach((item) => {
      if (!foodData[item.menuItemId]) {
        const menuItem = itemMap.get(item.menuItemId);
        foodData[item.menuItemId] = {
          id: item.menuItemId, name: item.name, quantity: 0,
          revenue: 0, costOfGoods: menuItem?.costOfGoods || 0, orders: 0,
        };
      }
      foodData[item.menuItemId].quantity += item.quantity || 0;
      foodData[item.menuItemId].revenue += item.totalPrice || 0;
      foodData[item.menuItemId].orders += 1;
    });
  });
  let items = Object.values(foodData)
    .map((item) => ({
      ...item,
      profit: item.revenue - item.costOfGoods * item.quantity,
      profitMargin: item.revenue > 0 ? ((item.revenue - item.costOfGoods * item.quantity) / item.revenue) * 100 : 0,
      avgPrice: item.quantity > 0 ? item.revenue / item.quantity : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  return {
    topItems: items.slice(0, 10),
    bottomItems: items.slice(-5).reverse(),
    mostProfitable: items.sort((a, b) => b.profit - a.profit).slice(0, 5),
    allItems: items,
  };
};

export const analyzeCashierPerformance = (orders = []) => {
  const cashierData = {};
  orders.forEach((order) => {
    const empId = order.employeeId || 'Unknown';
    if (!cashierData[empId]) {
      cashierData[empId] = {
        employeeId: empId, ordersProcessed: 0, totalRevenue: 0,
        cashOrders: 0, cardOrders: 0, completedOrders: 0,
        refundedOrders: 0, cancelledOrders: 0, refundAmount: 0,
      };
    }
    const c = cashierData[empId];
    c.ordersProcessed += 1;
    c.totalRevenue += order.total || 0;
    if (order.paymentMethod === 'cash') c.cashOrders += 1;
    if (order.paymentMethod === 'card') c.cardOrders += 1;
    if (order.status === 'completed' || order.status === 'served') c.completedOrders += 1;
    if (order.paymentStatus === 'refunded') { c.refundedOrders += 1; c.refundAmount += order.total || 0; }
    if (order.status === 'cancelled') c.cancelledOrders += 1;
  });
  return Object.values(cashierData)
    .map((c) => ({
      ...c,
      refundRate: c.ordersProcessed > 0 ? (c.refundedOrders / c.ordersProcessed) * 100 : 0,
      completionRate: c.ordersProcessed > 0 ? (c.completedOrders / c.ordersProcessed) * 100 : 0,
      avgOrderValue: c.ordersProcessed > 0 ? c.totalRevenue / c.ordersProcessed : 0,
      cashPercentage: c.ordersProcessed > 0 ? (c.cashOrders / c.ordersProcessed) * 100 : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
};

export const detectAnomalies = (orders = [], cashClose = null) => {
  const anomalies = [];
  const refundCounts = {};
  const refundTimes = {};
  orders.forEach((order) => {
    if (order.paymentStatus === 'refunded') {
      const empId = order.employeeId || 'Unknown';
      refundCounts[empId] = (refundCounts[empId] || 0) + 1;
      if (!refundTimes[empId]) refundTimes[empId] = [];
      if (order.createdAt) refundTimes[empId].push(order.createdAt?.toDate?.() || new Date(order.createdAt));
    }
  });
  Object.entries(refundTimes).forEach(([empId, times]) => {
    if (times.length < 2) return;
    const sorted = times.sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = (sorted[i + 1] - sorted[i]) / (1000 * 60);
      if (diff < 60 && i + 2 <= sorted.length) {
        if (sorted.slice(i, i + 3).length === 3) {
          anomalies.push({ type: 'REFUND_ABUSE', severity: 'critical', message: `Cashier ${empId} has ${refundCounts[empId]} refunds`, details: { employeeId: empId, count: refundCounts[empId] } });
          break;
        }
      }
    }
  });
  orders.forEach((order) => {
    if (!order.items) return;
    if (order.discount && order.subtotal > 0 && order.discount > order.subtotal * 0.5) {
      anomalies.push({ type: 'HIGH_DISCOUNT', severity: 'warning', message: `Order ${order.orderNumber || 'N/A'} has unusually high discount`, details: { orderNumber: order.orderNumber } });
    }
  });
  orders.forEach((order) => {
    if (order.total <= 0 && order.status !== 'cancelled') {
      anomalies.push({ type: 'ZERO_TOTAL', severity: 'critical', message: `Order ${order.orderNumber || 'N/A'} has zero or negative total`, details: { orderNumber: order.orderNumber, total: order.total } });
    }
  });
  if (cashClose && cashClose.discrepancy) {
    const discrepancyAmount = Math.abs(cashClose.discrepancy);
    if (discrepancyAmount > 500) {
      anomalies.push({ type: 'CASH_DISCREPANCY', severity: discrepancyAmount > 2000 ? 'critical' : 'warning', message: `Large cash discrepancy: ${formatCurrency(discrepancyAmount)}`, details: { discrepancy: cashClose.discrepancy } });
    }
  }
  return anomalies.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity]));
};

export const generateAlerts = (metrics = {}, anomalies = [], menuItems = []) => {
  const alerts = [];
  if (metrics.percentOfTarget <= 50) alerts.push({ type: 'REVENUE_CRITICAL', severity: 'critical', message: `Revenue critically low: ${metrics.percentOfTarget?.toFixed(0)}% of daily target`, actionable: true });
  else if (metrics.percentOfTarget <= 75) alerts.push({ type: 'REVENUE_WARNING', severity: 'warning', message: `Behind target: ${metrics.percentOfTarget?.toFixed(0)}% of goal`, actionable: true });
  if (metrics.percentOfTarget >= 110) alerts.push({ type: 'REVENUE_EXCELLENT', severity: 'info', message: `Excellent sales day! ${metrics.percentOfTarget?.toFixed(0)}% of target`, actionable: false });
  menuItems.forEach((item) => {
    if (item.stockLevel <= (item.lowStockThreshold || 5) && item.stockLevel > 0) alerts.push({ type: 'LOW_STOCK', severity: 'warning', message: `${item.name} running low: ${item.stockLevel} units left`, actionable: true });
    else if (item.stockLevel <= 0) alerts.push({ type: 'OUT_OF_STOCK', severity: 'critical', message: `${item.name} is OUT OF STOCK`, actionable: true });
  });
  anomalies.forEach((anom) => alerts.push({ type: anom.type, severity: anom.severity, message: anom.message, details: anom.details, actionable: true }));
  return alerts.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity]));
};

export const calculateRevenueForecast = (orders = [], targetRevenue = 50000) => {
  if (orders.length === 0) return null;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const percentDayComplete = (now - dayStart) / (24 * 60 * 60 * 1000);
  const currentRevenue = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0);
  const projectedRevenue = percentDayComplete > 0 ? currentRevenue / percentDayComplete : 0;
  return {
    currentRevenue, projectedRevenue, targetRevenue,
    willMakeTarget: projectedRevenue >= targetRevenue,
    projectionPercent: (projectedRevenue / targetRevenue) * 100,
  };
};

export const analyzePairings = (orders = []) => {
  const pairings = {};
  orders.forEach((order) => {
    if (!order.items || order.items.length < 2) return;
    const itemIds = order.items.map((i) => i.menuItemId).sort();
    for (let i = 0; i < itemIds.length; i++) {
      for (let j = i + 1; j < itemIds.length; j++) {
        const pair = `${itemIds[i]}|${itemIds[j]}`;
        pairings[pair] = (pairings[pair] || 0) + 1;
      }
    }
  });
  return Object.entries(pairings).map(([pair, count]) => ({ pair: pair.split('|'), frequency: count })).sort((a, b) => b.frequency - a.frequency).slice(0, 5);
};

export const generateSmartRecommendations = (orders = [], menuItems = [], metrics = {}, foodData = {}) => {
  const recommendations = [];
  if (metrics.percentOfTarget < 50) recommendations.push({ type: 'revenue', priority: 'high', icon: '\ud83d\udcb0', title: 'Boost Revenue', message: `Revenue is at ${metrics.percentOfTarget?.toFixed(0) || 0}% of target.` });
  else if (metrics.percentOfTarget >= 100) recommendations.push({ type: 'revenue', priority: 'success', icon: '\ud83c\udf89', title: 'Target Achieved!', message: `You've hit ${metrics.percentOfTarget?.toFixed(0)}% of your daily target.` });
  return recommendations.slice(0, 6);
};
