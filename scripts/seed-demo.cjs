/**
 * seed-demo.cjs
 * Seeds the Therapevo Farmaco Firebase project with pharma demo data.
 * Run: node scripts/seed-demo.cjs
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string) OR
 * a local serviceAccountKey.json file in the project root.
 *
 * Usage (Windows CMD):
 *   set FIREBASE_SERVICE_ACCOUNT_KEY=<json-string>
 *   node scripts/seed-demo.cjs
 *
 * Usage (Unix):
 *   export FIREBASE_SERVICE_ACCOUNT_KEY="$(cat serviceAccountKey.json)"
 *   node scripts/seed-demo.cjs
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ── Init ──────────────────────────────────────────────────────────────────────

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    console.error('ERROR: No service account found.');
    console.error('  Option A: set FIREBASE_SERVICE_ACCOUNT_KEY env var');
    console.error('  Option B: place serviceAccountKey.json in project root');
    process.exit(1);
  }
  serviceAccount = require(keyPath);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db        = admin.firestore();
const authAdmin = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const now = new Date();
const daysAgo = (n) => new Date(now - n * 864e5);

// ── Demo Users ─────────────────────────────────────────────────────────────────

const DEMO_USERS = [
  {
    username:  'demo_admin',
    email:     'demo_admin@therapevo.local',
    password:  'Demo@2026',
    role:      'admin',
    firstName: 'Alex',
    lastName:  'Administrador',
    phone:     '09171001001',
  },
  {
    username:  'demo_manager',
    email:     'demo_manager@therapevo.local',
    password:  'Demo@2026',
    role:      'med_rep_manager',
    firstName: 'Maria',
    lastName:  'Mercado',
    phone:     '09181002002',
  },
  {
    username:  'demo_medrep',
    email:     'demo_medrep@therapevo.local',
    password:  'Demo@2026',
    role:      'sales_rep',
    firstName: 'Carlo',
    lastName:  'Cruz',
    phone:     '09191003003',
  },
];

// ── Product Categories ─────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'cat_rx',       name: 'Prescription Medicine',  sortOrder: 1, isActive: true },
  { id: 'cat_otc',      name: 'Over-the-Counter',        sortOrder: 2, isActive: true },
  { id: 'cat_vitamins', name: 'Vitamins & Supplements',  sortOrder: 3, isActive: true },
  { id: 'cat_supplies', name: 'Medical Supplies',        sortOrder: 4, isActive: true },
  { id: 'cat_equip',    name: 'Medical Equipment',       sortOrder: 5, isActive: true },
];

// ── Products ───────────────────────────────────────────────────────────────────

const PRODUCTS = [
  // Prescription
  { name: 'Amoxicillin 500mg Capsule',      categoryId: 'cat_rx',       sku: 'RX-AMX-500',  unit: 'box (100 caps)',    price: 480,  costOfGoods: 210, stockLevel: 120, lowStockThreshold: 20, isActive: true, requiresPrescription: true,  description: 'Broad-spectrum penicillin antibiotic.' },
  { name: 'Metformin 500mg Tablet',         categoryId: 'cat_rx',       sku: 'RX-MET-500',  unit: 'box (100 tabs)',    price: 320,  costOfGoods: 130, stockLevel: 200, lowStockThreshold: 30, isActive: true, requiresPrescription: true,  description: 'Oral antidiabetic for Type 2 diabetes.' },
  { name: 'Amlodipine 5mg Tablet',          categoryId: 'cat_rx',       sku: 'RX-AML-005',  unit: 'box (30 tabs)',     price: 290,  costOfGoods: 120, stockLevel: 150, lowStockThreshold: 25, isActive: true, requiresPrescription: true,  description: 'Calcium channel blocker for hypertension.' },
  { name: 'Atorvastatin 20mg Tablet',       categoryId: 'cat_rx',       sku: 'RX-ATO-020',  unit: 'box (30 tabs)',     price: 520,  costOfGoods: 230, stockLevel: 90,  lowStockThreshold: 15, isActive: true, requiresPrescription: true,  description: 'Statin for lowering LDL cholesterol.' },
  { name: 'Losartan 50mg Tablet',           categoryId: 'cat_rx',       sku: 'RX-LOS-050',  unit: 'box (30 tabs)',     price: 340,  costOfGoods: 145, stockLevel: 110, lowStockThreshold: 20, isActive: true, requiresPrescription: true,  description: 'ARB for hypertension.' },
  { name: 'Omeprazole 20mg Capsule',        categoryId: 'cat_rx',       sku: 'RX-OMP-020',  unit: 'box (30 caps)',     price: 260,  costOfGoods: 100, stockLevel: 180, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Proton pump inhibitor for GERD.' },
  { name: 'Salbutamol 100mcg Inhaler',      categoryId: 'cat_rx',       sku: 'RX-SAL-INH',  unit: 'piece',            price: 650,  costOfGoods: 280, stockLevel: 45,  lowStockThreshold: 10, isActive: true, requiresPrescription: true,  description: 'Bronchodilator for asthma and COPD.' },
  { name: 'Insulin Glargine 100IU/mL',      categoryId: 'cat_rx',       sku: 'RX-INS-GLA',  unit: 'vial (10mL)',       price: 1850, costOfGoods: 820, stockLevel: 30,  lowStockThreshold: 8,  isActive: true, requiresPrescription: true,  description: 'Long-acting insulin for diabetes mellitus.' },

  // OTC
  { name: 'Paracetamol 500mg Tablet',       categoryId: 'cat_otc',      sku: 'OTC-PAR-500', unit: 'box (100 tabs)',    price: 180,  costOfGoods: 70,  stockLevel: 350, lowStockThreshold: 50, isActive: true, requiresPrescription: false, description: 'Analgesic and antipyretic.' },
  { name: 'Ibuprofen 400mg Tablet',         categoryId: 'cat_otc',      sku: 'OTC-IBU-400', unit: 'box (100 tabs)',    price: 220,  costOfGoods: 90,  stockLevel: 280, lowStockThreshold: 40, isActive: true, requiresPrescription: false, description: 'NSAID for pain and inflammation.' },
  { name: 'Cetirizine 10mg Tablet',         categoryId: 'cat_otc',      sku: 'OTC-CET-010', unit: 'box (30 tabs)',     price: 150,  costOfGoods: 55,  stockLevel: 200, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Antihistamine for allergies.' },
  { name: 'Loperamide 2mg Capsule',         categoryId: 'cat_otc',      sku: 'OTC-LOP-002', unit: 'box (20 caps)',     price: 130,  costOfGoods: 48,  stockLevel: 160, lowStockThreshold: 25, isActive: true, requiresPrescription: false, description: 'Antidiarrheal.' },
  { name: 'Mefenamic Acid 500mg Capsule',   categoryId: 'cat_otc',      sku: 'OTC-MEF-500', unit: 'box (100 caps)',    price: 200,  costOfGoods: 82,  stockLevel: 140, lowStockThreshold: 20, isActive: true, requiresPrescription: false, description: 'NSAID for mild to moderate pain.' },
  { name: 'Oral Rehydration Salts (ORS)',   categoryId: 'cat_otc',      sku: 'OTC-ORS-PKT', unit: 'pack (12 sachets)', price: 90,   costOfGoods: 32,  stockLevel: 220, lowStockThreshold: 40, isActive: true, requiresPrescription: false, description: 'Electrolyte solution for dehydration.' },

  // Vitamins
  { name: 'Vitamin C 500mg Tablet',         categoryId: 'cat_vitamins', sku: 'VIT-C-500',   unit: 'bottle (100 tabs)', price: 210,  costOfGoods: 80,  stockLevel: 300, lowStockThreshold: 50, isActive: true, requiresPrescription: false, description: 'Ascorbic acid for immune support.' },
  { name: 'Vitamin D3 1000IU Softgel',      categoryId: 'cat_vitamins', sku: 'VIT-D3-1K',   unit: 'bottle (60 caps)',  price: 380,  costOfGoods: 150, stockLevel: 180, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Cholecalciferol for bone health.' },
  { name: 'B-Complex Tablet',               categoryId: 'cat_vitamins', sku: 'VIT-BCX-TAB', unit: 'bottle (100 tabs)', price: 250,  costOfGoods: 95,  stockLevel: 250, lowStockThreshold: 40, isActive: true, requiresPrescription: false, description: 'Complete B-vitamin complex.' },
  { name: 'Ferrous Sulfate 325mg Tablet',   categoryId: 'cat_vitamins', sku: 'VIT-FES-325', unit: 'box (100 tabs)',    price: 160,  costOfGoods: 58,  stockLevel: 190, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Iron supplement for anemia.' },
  { name: 'Omega-3 Fish Oil 1000mg',        categoryId: 'cat_vitamins', sku: 'VIT-OM3-1K',  unit: 'bottle (60 caps)',  price: 480,  costOfGoods: 190, stockLevel: 120, lowStockThreshold: 20, isActive: true, requiresPrescription: false, description: 'Essential fatty acids for cardiovascular health.' },

  // Medical Supplies
  { name: 'Surgical Face Mask (3-ply)',     categoryId: 'cat_supplies', sku: 'SUP-MSK-3PL', unit: 'box (50 pcs)',      price: 180,  costOfGoods: 70,  stockLevel: 500, lowStockThreshold: 100, isActive: true, requiresPrescription: false, description: 'Disposable 3-layer surgical mask.' },
  { name: 'Alcohol 70% Isopropyl 500mL',   categoryId: 'cat_supplies', sku: 'SUP-ALC-500', unit: 'bottle',            price: 95,   costOfGoods: 38,  stockLevel: 300, lowStockThreshold: 50,  isActive: true, requiresPrescription: false, description: '70% IPA for disinfection.' },
  { name: 'Disposable Syringe 5mL',        categoryId: 'cat_supplies', sku: 'SUP-SYR-5ML', unit: 'box (100 pcs)',     price: 350,  costOfGoods: 130, stockLevel: 200, lowStockThreshold: 30,  isActive: true, requiresPrescription: false, description: 'Sterile single-use syringe with needle.' },
  { name: 'Blood Glucose Test Strips',     categoryId: 'cat_supplies', sku: 'SUP-BGT-50',  unit: 'box (50 strips)',   price: 750,  costOfGoods: 310, stockLevel: 80,  lowStockThreshold: 15,  isActive: true, requiresPrescription: false, description: 'Compatible with standard glucometers.' },
  { name: 'Sterile Gauze Pad 4×4"',        categoryId: 'cat_supplies', sku: 'SUP-GZP-4X4', unit: 'pack (10 pcs)',     price: 65,   costOfGoods: 24,  stockLevel: 400, lowStockThreshold: 60,  isActive: true, requiresPrescription: false, description: 'Non-woven sterile gauze for wound care.' },

  // Equipment
  { name: 'Digital BP Monitor',            categoryId: 'cat_equip',    sku: 'EQP-BPM-DGT', unit: 'piece',            price: 1850, costOfGoods: 780, stockLevel: 25,  lowStockThreshold: 5,   isActive: true, requiresPrescription: false, description: 'Automatic upper-arm blood pressure monitor.' },
  { name: 'Digital Thermometer',           categoryId: 'cat_equip',    sku: 'EQP-THM-DGT', unit: 'piece',            price: 450,  costOfGoods: 180, stockLevel: 40,  lowStockThreshold: 8,   isActive: true, requiresPrescription: false, description: 'Fast-read digital thermometer.' },
  { name: 'Fingertip Pulse Oximeter',      categoryId: 'cat_equip',    sku: 'EQP-POX-FGR', unit: 'piece',            price: 980,  costOfGoods: 390, stockLevel: 18,  lowStockThreshold: 4,   isActive: true, requiresPrescription: false, description: 'SpO2 and pulse rate monitor.' },
];

// ── Medical Reps ───────────────────────────────────────────────────────────────

const MED_REPS = [
  { name: 'Carlo Cruz',     territory: 'Metro Manila — NCR',   phone: '09191003003', email: 'demo_medrep@therapevo.local',  isActive: true, targetMonthly: 120000, isLinkedUser: true  },
  { name: 'Bianca Reyes',   territory: 'Calabarzon Region',    phone: '09201004004', email: 'bianca.reyes@therapevo.local', isActive: true, targetMonthly: 100000, isLinkedUser: false },
  { name: 'Dennis Santos',  territory: 'Central Luzon',        phone: '09211005005', email: 'dennis.santos@therapevo.local',isActive: true, targetMonthly: 95000,  isLinkedUser: false },
  { name: 'Liza Gutierrez', territory: 'Visayas — Region VII', phone: '09221006006', email: 'liza.g@therapevo.local',       isActive: true, targetMonthly: 85000,  isLinkedUser: false },
];

// ── Customers ─────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { name: "St. Luke's Medical Center",  contactPerson: 'Dr. Anna Lim',      phone: '02-88888888', address: 'Quezon City, Metro Manila', creditLimit: 500000, paymentTerms: 30 },
  { name: 'Makati Medical Center',      contactPerson: 'Procurement Dept.', phone: '02-88888000', address: 'Makati City, Metro Manila',  creditLimit: 400000, paymentTerms: 30 },
  { name: 'Mercury Drug — Parañaque',   contactPerson: 'Jose Dizon',        phone: '02-82345678', address: 'Parañaque City',             creditLimit: 150000, paymentTerms: 15 },
  { name: 'Generika Pharmacy — Pasig',  contactPerson: 'Rosa Tan',          phone: '02-83456789', address: 'Pasig City',                 creditLimit: 100000, paymentTerms: 15 },
  { name: 'RxGo Community Clinic',      contactPerson: 'Dr. Ben Flores',    phone: '09301001001', address: 'Las Piñas City',             creditLimit: 80000,  paymentTerms: 30 },
  { name: 'Ospital ng Maynila',         contactPerson: 'Supply Office',     phone: '02-85256000', address: 'Manila City',                creditLimit: 300000, paymentTerms: 45 },
  { name: 'Cardinal Santos Med Center', contactPerson: 'Dr. Clara Ocampo',  phone: '02-87279444', address: 'San Juan, Metro Manila',     creditLimit: 350000, paymentTerms: 30 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFrom(arr)     { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱  Starting Therapevo Farmaco demo seed...\n');

  // 1. Demo users
  console.log('👤  Creating demo users...');
  const userUids = {};
  for (const u of DEMO_USERS) {
    try {
      const existing = await authAdmin.getUserByEmail(u.email).catch(() => null);
      let uid;
      if (existing) {
        uid = existing.uid;
        await authAdmin.updateUser(uid, { password: u.password, displayName: `${u.firstName} ${u.lastName}` });
        console.log(`   ✓ Updated: ${u.username}`);
      } else {
        const record = await authAdmin.createUser({ email: u.email, password: u.password, displayName: `${u.firstName} ${u.lastName}` });
        uid = record.uid;
        console.log(`   ✓ Created: ${u.username}`);
      }
      userUids[u.username] = uid;
      await db.collection('users').doc(uid).set({
        username:   u.username,
        email:      u.email,
        role:       u.role,
        firstName:  u.firstName,
        lastName:   u.lastName,
        phone:      u.phone,
        address:    '',
        dailyRate:  0,
        department: 'Demo',
        isActive:   true,
        createdAt:  FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error(`   ✗ Failed for ${u.username}: ${err.message}`);
    }
  }

  // 2. Product categories
  console.log('\n📂  Seeding product categories...');
  for (const cat of CATEGORIES) {
    const { id, ...data } = cat;
    await db.collection('product_categories').doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    console.log(`   ✓ ${cat.name}`);
  }

  // 3. Products
  console.log('\n💊  Seeding pharmaceutical products...');
  const productIds = {};
  for (const p of PRODUCTS) {
    const ref = await db.collection('products').add({ ...p, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    productIds[p.sku] = ref.id;
    console.log(`   ✓ ${p.name}`);
  }

  // 4. Inventory
  console.log('\n📦  Seeding inventory...');
  for (const p of PRODUCTS) {
    await db.collection('inventory').add({
      productId:         productIds[p.sku],
      productName:       p.name,
      sku:               p.sku,
      stockLevel:        p.stockLevel,
      lowStockThreshold: p.lowStockThreshold,
      unit:              p.unit,
      warehouseLocation: randomFrom(['Rack A', 'Rack B', 'Cold Storage', 'Shelf C', 'Rack D']),
      lastRestockedAt:   FieldValue.serverTimestamp(),
      createdAt:         FieldValue.serverTimestamp(),
      updatedAt:         FieldValue.serverTimestamp(),
    });
  }
  console.log(`   ✓ ${PRODUCTS.length} inventory records`);

  // 5. Medical reps
  console.log('\n🩺  Seeding medical representatives...');
  const repIds = [];
  for (const rep of MED_REPS) {
    const { isLinkedUser, ...repData } = rep;
    const userId = isLinkedUser ? (userUids['demo_medrep'] || null) : null;
    const ref = await db.collection('medical_reps').add({
      ...repData,
      userId,
      totalSales:  randomInt(50000, 200000),
      salesCount:  randomInt(20, 80),
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    });
    repIds.push(ref.id);
    console.log(`   ✓ ${rep.name}`);
  }

  // 6. Accounts receivable (customers with outstanding balances)
  console.log('\n🏥  Seeding accounts receivable...');
  for (const c of CUSTOMERS) {
    const total = randomInt(20000, 180000);
    const paid  = randomInt(0, Math.floor(total * 0.6));
    await db.collection('accounts_receivable').add({
      ...c,
      totalAmount:     total,
      paidAmount:      paid,
      balanceAmount:   total - paid,
      status:          randomFrom(['current', 'current', 'current', 'overdue']),
      dueDate:         admin.firestore.Timestamp.fromDate(daysAgo(randomInt(-30, 30))),
      lastPaymentDate: admin.firestore.Timestamp.fromDate(daysAgo(randomInt(5, 60))),
      notes:           '',
      createdAt:       FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
    });
    console.log(`   ✓ ${c.name}`);
  }

  // 7. Sales transactions
  console.log('\n🧣  Creating sales transactions...');
  const productList = PRODUCTS.map((p) => ({ id: productIds[p.sku], ...p }));
  const salesScenarios = [
    { ago: 1,  customer: CUSTOMERS[0], status: 'completed',       repIdx: 0 },
    { ago: 1,  customer: CUSTOMERS[2], status: 'delivered',       repIdx: 1 },
    { ago: 2,  customer: CUSTOMERS[1], status: 'pending_approval',repIdx: 0 },
    { ago: 3,  customer: CUSTOMERS[4], status: 'completed',       repIdx: 2 },
    { ago: 3,  customer: CUSTOMERS[3], status: 'delivered',       repIdx: 1 },
    { ago: 5,  customer: CUSTOMERS[6], status: 'completed',       repIdx: 0 },
    { ago: 5,  customer: CUSTOMERS[0], status: 'completed',       repIdx: 2 },
    { ago: 7,  customer: CUSTOMERS[5], status: 'approved',        repIdx: 3 },
    { ago: 8,  customer: CUSTOMERS[2], status: 'completed',       repIdx: 1 },
    { ago: 10, customer: CUSTOMERS[1], status: 'completed',       repIdx: 0 },
    { ago: 12, customer: CUSTOMERS[4], status: 'cancelled',       repIdx: 2 },
    { ago: 14, customer: CUSTOMERS[3], status: 'completed',       repIdx: 1 },
    { ago: 15, customer: CUSTOMERS[6], status: 'completed',       repIdx: 3 },
    { ago: 18, customer: CUSTOMERS[0], status: 'completed',       repIdx: 0 },
    { ago: 20, customer: CUSTOMERS[5], status: 'completed',       repIdx: 2 },
    { ago: 22, customer: CUSTOMERS[2], status: 'completed',       repIdx: 1 },
    { ago: 25, customer: CUSTOMERS[1], status: 'completed',       repIdx: 0 },
    { ago: 28, customer: CUSTOMERS[4], status: 'completed',       repIdx: 3 },
  ];
  const paymentMethods = ['cash', 'bank_transfer', 'check', 'credit_term', 'gcash'];

  for (let i = 0; i < salesScenarios.length; i++) {
    const sd    = salesScenarios[i];
    const count = randomInt(2, 5);
    const items = [];
    const used  = new Set();
    for (let j = 0; j < count; j++) {
      let p;
      do { p = randomFrom(productList); } while (used.has(p.id));
      used.add(p.id);
      const qty = randomInt(5, 50);
      items.push({ productId: p.id, productName: p.name, sku: p.sku, quantity: qty, unitPrice: p.price, total: qty * p.price });
    }
    const subtotal = items.reduce((s, ci) => s + ci.total, 0);
    const discount = randomFrom([0, 0, 0, Math.round(subtotal * 0.05), Math.round(subtotal * 0.1)]);
    const total    = subtotal - discount;
    const txDate   = admin.firestore.Timestamp.fromDate(daysAgo(sd.ago));

    const txRef = await db.collection('sales_transactions').add({
      transactionNumber: `ST-2026-${String(i + 1).padStart(4, '0')}`,
      customerName:      sd.customer.name,
      customerPhone:     sd.customer.phone,
      customerAddress:   sd.customer.address,
      repId:             repIds[sd.repIdx] || null,
      repName:           MED_REPS[sd.repIdx]?.name || '',
      items,
      subtotal,
      discount,
      total,
      paymentMethod: randomFrom(paymentMethods),
      paymentStatus: sd.status === 'completed' ? 'paid' : 'pending',
      status:        sd.status,
      notes:         '',
      source:        'demo',
      createdAt:     txDate,
      updatedAt:     txDate,
    });

    for (const item of items) {
      await db.collection('sale_items').add({ transactionId: txRef.id, ...item, createdAt: txDate });
    }
  }
  console.log(`   ✓ ${salesScenarios.length} sales transactions created`);

  // 8. Expenses
  console.log('\n💸  Seeding expenses...');
  const EXPENSES = [
    { description: 'Cold chain logistics — NCR delivery run',    category: 'Logistics',        amount: 12500,  ago: 2  },
    { description: 'Warehouse rent — June 2026',                 category: 'Administrative',   amount: 45000,  ago: 5  },
    { description: 'Staff salaries — May 2026',                  category: 'Salaries & Wages', amount: 180000, ago: 7  },
    { description: 'Procurement — Amoxicillin restock',          category: 'Procurement',      amount: 38000,  ago: 8  },
    { description: 'Delivery van fuel — June',                   category: 'Logistics',        amount: 8500,   ago: 12 },
    { description: 'Regulatory compliance filing fees',          category: 'Administrative',   amount: 6200,   ago: 14 },
    { description: 'Cold storage electricity — May',            category: 'Utilities',        amount: 22000,  ago: 15 },
    { description: 'Procurement — Insulin Glargine restock',     category: 'Procurement',      amount: 65000,  ago: 18 },
    { description: 'Sales team training seminar',                category: 'Marketing',        amount: 15000,  ago: 20 },
    { description: 'Office supplies and packaging materials',    category: 'Administrative',   amount: 4800,   ago: 22 },
    { description: 'Vehicle maintenance — delivery van service', category: 'Maintenance',      amount: 9500,   ago: 25 },
    { description: 'Procurement — OTC medicines bulk purchase',  category: 'Procurement',      amount: 52000,  ago: 28 },
  ];
  for (const exp of EXPENSES) {
    const d = admin.firestore.Timestamp.fromDate(daysAgo(exp.ago));
    await db.collection('expenses').add({
      description:   exp.description,
      category:      exp.category,
      amount:        exp.amount,
      date:          d,
      paymentMethod: randomFrom(['cash', 'bank_transfer', 'check']),
      status:        'approved',
      approvedBy:    'demo_admin',
      receiptUrl:    '',
      notes:         '',
      createdAt:     d,
      updatedAt:     d,
    });
  }
  console.log(`   ✓ ${EXPENSES.length} expense records`);

  // 9. System settings
  console.log('\n⚙️   Writing system settings...');
  await db.collection('system_settings').doc('main').set({
    companyName:   'Therapevo Farmaco',
    address:       '123 Pharmaceutical Ave., Pasig City, Metro Manila',
    phone:         '02-8100-2026',
    email:         'info@therapevo.local',
    currency:      'PHP',
    taxRate:       12,
    isOpen:        true,
    closedMessage: '',
    createdAt:     FieldValue.serverTimestamp(),
    updatedAt:     FieldValue.serverTimestamp(),
  });
  console.log('   ✓ system_settings/main');

  console.log('\n✅  Therapevo Farmaco demo seed complete!\n');
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│           DEMO LOGIN CREDENTIALS               │');
  console.log('├────────────────┬───────────────┬──────────────┤');
  console.log('│ Role           │ Username      │ Password     │');
  console.log('├────────────────┼───────────────┼──────────────┤');
  console.log('│ Admin          │ demo_admin    │ Demo@2026    │');
  console.log('│ Manager        │ demo_manager  │ Demo@2026    │');
  console.log('│ Med Rep        │ demo_medrep   │ Demo@2026    │');
  console.log('└────────────────┴───────────────┴──────────────┘');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
