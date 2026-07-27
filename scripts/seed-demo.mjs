/**
 * seed-demo.mjs
 * Seeds the pharma-database-7e7ab Firebase project using the client SDK.
 * No service account key required — uses the web API key.
 *
 * Run: node scripts/seed-demo.mjs
 */

import { initializeApp }  from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp, Timestamp, getDocs, writeBatch, updateDoc } from 'firebase/firestore';

// ── Config ───────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            'AIzaSyDVM7SisH1LHAmCpxU2JZb5F6bwxtialYk',
  authDomain:        'pharma-database-7e7ab.firebaseapp.com',
  projectId:         'pharma-database-7e7ab',
  storageBucket:     'pharma-database-7e7ab.firebasestorage.app',
  messagingSenderId: '1057969733664',
  appId:             '1:1057969733664:web:0f7dcab9f000e4774b3c45',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const now    = new Date();
const ago    = (n) => Timestamp.fromDate(new Date(now - n * 864e5));
const rnd    = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick   = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ts     = () => serverTimestamp();
/** Fixed-date Timestamp: d(2026, 5, 22) → May 22 2026 00:00 local */
const d      = (y, m, day) => Timestamp.fromDate(new Date(y, m - 1, day));

/** Delete all docs in a Firestore collection (client SDK, batched) */
const clearCollection = async (name) => {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return;
  for (let i = 0; i < snap.docs.length; i += 499) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 499).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
};

// ── Demo Users ──────────────────────────────────────────────────────────────────────────

const DEMO_USERS = [
  // Admin
  { username: 'demo_admin',    email: 'demo_admin@therapevo.local',    password: 'Demo@2026', role: 'admin',          firstName: 'Alex',      lastName: 'Administrador', phone: '09171001001' },
  // Managers
  { username: 'demo_manager1', email: 'demo_manager1@therapevo.local', password: 'Demo@2026', role: 'med_rep_manager', firstName: 'Maria',     lastName: 'Mercado',      phone: '09181002001' },
  { username: 'demo_manager2', email: 'demo_manager2@therapevo.local', password: 'Demo@2026', role: 'med_rep_manager', firstName: 'Ramon',     lastName: 'Rivera',       phone: '09181002002' },
  { username: 'demo_manager3', email: 'demo_manager3@therapevo.local', password: 'Demo@2026', role: 'med_rep_manager', firstName: 'Patricia',  lastName: 'Pascual',      phone: '09181002003' },
  // Med Reps
  { username: 'demo_medrep1',  email: 'demo_medrep1@therapevo.local',  password: 'Demo@2026', role: 'sales_rep',      firstName: 'Carlo',     lastName: 'Cruz',         phone: '09191003001' },
  { username: 'demo_medrep2',  email: 'demo_medrep2@therapevo.local',  password: 'Demo@2026', role: 'sales_rep',      firstName: 'Bianca',    lastName: 'Reyes',        phone: '09191003002' },
  { username: 'demo_medrep3',  email: 'demo_medrep3@therapevo.local',  password: 'Demo@2026', role: 'sales_rep',      firstName: 'Dennis',    lastName: 'Santos',       phone: '09191003003' },
  { username: 'demo_medrep4',  email: 'demo_medrep4@therapevo.local',  password: 'Demo@2026', role: 'sales_rep',      firstName: 'Liza',      lastName: 'Gutierrez',    phone: '09191003004' },
  { username: 'demo_medrep5',  email: 'demo_medrep5@therapevo.local',  password: 'Demo@2026', role: 'sales_rep',      firstName: 'Miguel',    lastName: 'Mendoza',      phone: '09191003005' },
  { username: 'demo_medrep6',  email: 'demo_medrep6@therapevo.local',  password: 'Demo@2026', role: 'sales_rep',      firstName: 'Sofia',     lastName: 'Santiago',     phone: '09191003006' },
];

// ── Product Categories ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'cat_rx',       name: 'Prescription Medicine',  sortOrder: 1, isActive: true },
  { id: 'cat_otc',      name: 'Over-the-Counter',        sortOrder: 2, isActive: true },
  { id: 'cat_vitamins', name: 'Vitamins & Supplements',  sortOrder: 3, isActive: true },
  { id: 'cat_supplies', name: 'Medical Supplies',        sortOrder: 4, isActive: true },
  { id: 'cat_equip',    name: 'Medical Equipment',       sortOrder: 5, isActive: true },
];

// ── Products ───────────────────────────────────────────────────────────────────────────

const PRODUCTS = [
  // Prescription
  { name: 'Amoxicillin 500mg Capsule',     categoryId: 'cat_rx',       sku: 'RX-AMX-500',  unit: 'box (100 caps)',    price: 480,  costOfGoods: 210, stockLevel: 120, lowStockThreshold: 20, isActive: true, requiresPrescription: true,  description: 'Broad-spectrum antibiotic.',               imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Amoxicillin.JPG/500px-Amoxicillin.JPG' },
  { name: 'Metformin 500mg Tablet',        categoryId: 'cat_rx',       sku: 'RX-MET-500',  unit: 'box (100 tabs)',    price: 320,  costOfGoods: 130, stockLevel: 200, lowStockThreshold: 30, isActive: true, requiresPrescription: true,  description: 'Oral antidiabetic for Type 2 diabetes.',   imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Metformin_500mg_Tablets.jpg/500px-Metformin_500mg_Tablets.jpg' },
  { name: 'Amlodipine 5mg Tablet',         categoryId: 'cat_rx',       sku: 'RX-AML-005',  unit: 'box (30 tabs)',     price: 290,  costOfGoods: 120, stockLevel: 150, lowStockThreshold: 25, isActive: true, requiresPrescription: true,  description: 'Calcium channel blocker for hypertension.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Amlodipine_tablets.jpg/500px-Amlodipine_tablets.jpg' },
  { name: 'Atorvastatin 20mg Tablet',      categoryId: 'cat_rx',       sku: 'RX-ATO-020',  unit: 'box (30 tabs)',     price: 520,  costOfGoods: 230, stockLevel: 90,  lowStockThreshold: 15, isActive: true, requiresPrescription: true,  description: 'Statin for lowering LDL cholesterol.',     imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Atorvastatin40mg.jpg/500px-Atorvastatin40mg.jpg' },
  { name: 'Losartan 50mg Tablet',          categoryId: 'cat_rx',       sku: 'RX-LOS-050',  unit: 'box (30 tabs)',     price: 340,  costOfGoods: 145, stockLevel: 110, lowStockThreshold: 20, isActive: true, requiresPrescription: true,  description: 'ARB for hypertension.',                    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Losartan_tablets.jpg/500px-Losartan_tablets.jpg' },
  { name: 'Omeprazole 20mg Capsule',       categoryId: 'cat_rx',       sku: 'RX-OMP-020',  unit: 'box (30 caps)',     price: 260,  costOfGoods: 100, stockLevel: 180, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Proton pump inhibitor for GERD.',          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Omeprazol_Activis_bottle.jpg/500px-Omeprazol_Activis_bottle.jpg' },
  { name: 'Salbutamol 100mcg Inhaler',     categoryId: 'cat_rx',       sku: 'RX-SAL-INH',  unit: 'piece',            price: 650,  costOfGoods: 280, stockLevel: 45,  lowStockThreshold: 10, isActive: true, requiresPrescription: true,  description: 'Bronchodilator for asthma.',               imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Ventolin_2mg.JPG/500px-Ventolin_2mg.JPG' },
  { name: 'Insulin Glargine 100IU/mL',     categoryId: 'cat_rx',       sku: 'RX-INS-GLA',  unit: 'vial (10mL)',       price: 1850, costOfGoods: 820, stockLevel: 30,  lowStockThreshold: 8,  isActive: true, requiresPrescription: true,  description: 'Long-acting insulin for diabetes.',        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Insulin_pen_with_needle.jpg/500px-Insulin_pen_with_needle.jpg' },
  // OTC
  { name: 'Paracetamol 500mg Tablet',      categoryId: 'cat_otc',      sku: 'OTC-PAR-500', unit: 'box (100 tabs)',    price: 180,  costOfGoods: 70,  stockLevel: 350, lowStockThreshold: 50, isActive: true, requiresPrescription: false, description: 'Analgesic and antipyretic.',               imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Panadol.jpg/500px-Panadol.jpg' },
  { name: 'Ibuprofen 400mg Tablet',        categoryId: 'cat_otc',      sku: 'OTC-IBU-400', unit: 'box (100 tabs)',    price: 220,  costOfGoods: 90,  stockLevel: 280, lowStockThreshold: 40, isActive: true, requiresPrescription: false, description: 'NSAID for pain and inflammation.',         imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/200mg_ibuprofen_tablets.jpg/500px-200mg_ibuprofen_tablets.jpg' },
  { name: 'Cetirizine 10mg Tablet',        categoryId: 'cat_otc',      sku: 'OTC-CET-010', unit: 'box (30 tabs)',     price: 150,  costOfGoods: 55,  stockLevel: 200, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Antihistamine for allergies.',             imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Cetirizine_10mg_Tablets.jpg/500px-Cetirizine_10mg_Tablets.jpg' },
  { name: 'Loperamide 2mg Capsule',        categoryId: 'cat_otc',      sku: 'OTC-LOP-002', unit: 'box (20 caps)',     price: 130,  costOfGoods: 48,  stockLevel: 160, lowStockThreshold: 25, isActive: true, requiresPrescription: false, description: 'Antidiarrheal.',                           imageUrl: 'https://placehold.co/300x300/0891B2/white?text=Loperamide' },
  { name: 'Mefenamic Acid 500mg Capsule',  categoryId: 'cat_otc',      sku: 'OTC-MEF-500', unit: 'box (100 caps)',    price: 200,  costOfGoods: 82,  stockLevel: 140, lowStockThreshold: 20, isActive: true, requiresPrescription: false, description: 'NSAID for mild to moderate pain.',         imageUrl: 'https://placehold.co/300x300/0891B2/white?text=Mefenamic+Acid' },
  { name: 'Oral Rehydration Salts (ORS)',  categoryId: 'cat_otc',      sku: 'OTC-ORS-PKT', unit: 'pack (12 sachets)', price: 90,   costOfGoods: 32,  stockLevel: 220, lowStockThreshold: 40, isActive: true, requiresPrescription: false, description: 'Electrolyte solution for dehydration.',    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Oral_Rehydration_Therapy_Packets.jpg/500px-Oral_Rehydration_Therapy_Packets.jpg' },
  // Vitamins
  { name: 'Vitamin C 500mg Tablet',        categoryId: 'cat_vitamins', sku: 'VIT-C-500',   unit: 'bottle (100 tabs)', price: 210,  costOfGoods: 80,  stockLevel: 300, lowStockThreshold: 50, isActive: true, requiresPrescription: false, description: 'Ascorbic acid for immune support.',        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Vitamin-C-tablets.jpg/500px-Vitamin-C-tablets.jpg' },
  { name: 'Vitamin D3 1000IU Softgel',     categoryId: 'cat_vitamins', sku: 'VIT-D3-1K',   unit: 'bottle (60 caps)',  price: 380,  costOfGoods: 150, stockLevel: 180, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Cholecalciferol for bone health.',         imageUrl: 'https://placehold.co/300x300/F59E0B/white?text=Vitamin+D3' },
  { name: 'B-Complex Tablet',              categoryId: 'cat_vitamins', sku: 'VIT-BCX-TAB', unit: 'bottle (100 tabs)', price: 250,  costOfGoods: 95,  stockLevel: 250, lowStockThreshold: 40, isActive: true, requiresPrescription: false, description: 'Complete B-vitamin complex.',              imageUrl: 'https://placehold.co/300x300/F59E0B/white?text=B-Complex' },
  { name: 'Ferrous Sulfate 325mg Tablet',  categoryId: 'cat_vitamins', sku: 'VIT-FES-325', unit: 'box (100 tabs)',    price: 160,  costOfGoods: 58,  stockLevel: 190, lowStockThreshold: 30, isActive: true, requiresPrescription: false, description: 'Iron supplement for anemia.',              imageUrl: 'https://placehold.co/300x300/F59E0B/white?text=Ferrous+Sulfate' },
  { name: 'Omega-3 Fish Oil 1000mg',       categoryId: 'cat_vitamins', sku: 'VIT-OM3-1K',  unit: 'bottle (60 caps)',  price: 480,  costOfGoods: 190, stockLevel: 120, lowStockThreshold: 20, isActive: true, requiresPrescription: false, description: 'Omega-3 for cardiovascular health.',       imageUrl: 'https://placehold.co/300x300/F59E0B/white?text=Omega-3' },
  // Medical Supplies
  { name: 'Surgical Face Mask (3-ply)',    categoryId: 'cat_supplies', sku: 'SUP-MSK-3PL', unit: 'box (50 pcs)',      price: 180,  costOfGoods: 70,  stockLevel: 500, lowStockThreshold: 100, isActive: true, requiresPrescription: false, description: 'Disposable 3-layer surgical mask.',       imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Surgical_mask.jpg/500px-Surgical_mask.jpg' },
  { name: 'Alcohol 70% Isopropyl 500mL',  categoryId: 'cat_supplies', sku: 'SUP-ALC-500', unit: 'bottle',            price: 95,   costOfGoods: 38,  stockLevel: 300, lowStockThreshold: 50,  isActive: true, requiresPrescription: false, description: '70% IPA for disinfection.',                imageUrl: 'https://placehold.co/300x300/64748B/white?text=Alcohol+70%25' },
  { name: 'Disposable Syringe 5mL',       categoryId: 'cat_supplies', sku: 'SUP-SYR-5ML', unit: 'box (100 pcs)',     price: 350,  costOfGoods: 130, stockLevel: 200, lowStockThreshold: 30,  isActive: true, requiresPrescription: false, description: 'Sterile single-use syringe.',              imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Plastic_syringes.jpg/500px-Plastic_syringes.jpg' },
  { name: 'Blood Glucose Test Strips',    categoryId: 'cat_supplies', sku: 'SUP-BGT-50',  unit: 'box (50 strips)',   price: 750,  costOfGoods: 310, stockLevel: 80,  lowStockThreshold: 15,  isActive: true, requiresPrescription: false, description: 'Compatible with standard glucometers.',    imageUrl: 'https://placehold.co/300x300/64748B/white?text=Test+Strips' },
  { name: 'Sterile Gauze Pad 4x4"',       categoryId: 'cat_supplies', sku: 'SUP-GZP-4X4', unit: 'pack (10 pcs)',     price: 65,   costOfGoods: 24,  stockLevel: 400, lowStockThreshold: 60,  isActive: true, requiresPrescription: false, description: 'Non-woven sterile gauze for wound care.',  imageUrl: 'https://placehold.co/300x300/64748B/white?text=Gauze+Pad' },
  // Equipment
  { name: 'Digital BP Monitor',           categoryId: 'cat_equip',    sku: 'EQP-BPM-DGT', unit: 'piece',            price: 1850, costOfGoods: 780, stockLevel: 25,  lowStockThreshold: 5,   isActive: true, requiresPrescription: false, description: 'Automatic upper-arm BP monitor.',          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Blood_pressure_meter.jpg/500px-Blood_pressure_meter.jpg' },
  { name: 'Digital Thermometer',          categoryId: 'cat_equip',    sku: 'EQP-THM-DGT', unit: 'piece',            price: 450,  costOfGoods: 180, stockLevel: 40,  lowStockThreshold: 8,   isActive: true, requiresPrescription: false, description: 'Fast-read digital thermometer.',           imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Clinical_thermometer_38.7.jpg/500px-Clinical_thermometer_38.7.jpg' },
  { name: 'Fingertip Pulse Oximeter',     categoryId: 'cat_equip',    sku: 'EQP-POX-FGR', unit: 'piece',            price: 980,  costOfGoods: 390, stockLevel: 18,  lowStockThreshold: 4,   isActive: true, requiresPrescription: false, description: 'SpO2 and pulse rate monitor.',             imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Pulse_oximetry_p1130698.jpg/500px-Pulse_oximetry_p1130698.jpg' },
];

// ── Medical Reps ──────────────────────────────────────────────────────────────────────────

const MED_REPS = [
  { name: 'Carlo Cruz',     territory: 'Metro Manila — NCR',   phone: '09191003001', email: 'demo_medrep1@therapevo.local', isActive: true, targetMonthly: 120000, linkedUsername: 'demo_medrep1', managedBy: 'demo_manager1' },
  { name: 'Bianca Reyes',   territory: 'Calabarzon Region',    phone: '09191003002', email: 'demo_medrep2@therapevo.local', isActive: true, targetMonthly: 100000, linkedUsername: 'demo_medrep2', managedBy: 'demo_manager1' },
  { name: 'Dennis Santos',  territory: 'Central Luzon',        phone: '09191003003', email: 'demo_medrep3@therapevo.local', isActive: true, targetMonthly: 95000,  linkedUsername: 'demo_medrep3', managedBy: 'demo_manager2' },
  { name: 'Liza Gutierrez', territory: 'Visayas — Region VII', phone: '09191003004', email: 'demo_medrep4@therapevo.local', isActive: true, targetMonthly: 85000,  linkedUsername: 'demo_medrep4', managedBy: 'demo_manager2' },
  { name: 'Miguel Mendoza', territory: 'Mindanao — Region XI', phone: '09191003005', email: 'demo_medrep5@therapevo.local', isActive: true, targetMonthly: 90000,  linkedUsername: 'demo_medrep5', managedBy: 'demo_manager3' },
  { name: 'Sofia Santiago', territory: 'Western Visayas',      phone: '09191003006', email: 'demo_medrep6@therapevo.local', isActive: true, targetMonthly: 88000,  linkedUsername: 'demo_medrep6', managedBy: 'demo_manager3' },
];

// ── Customers ─────────────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { name: "St. Luke's Medical Center",  contactPerson: 'Dr. Anna Lim',      phone: '02-88888888', address: 'Quezon City, Metro Manila', creditLimit: 500000, paymentTerms: 30 },
  { name: 'Makati Medical Center',      contactPerson: 'Procurement Dept.', phone: '02-88888000', address: 'Makati City, Metro Manila',  creditLimit: 400000, paymentTerms: 30 },
  { name: 'Mercury Drug — Paranaque',   contactPerson: 'Jose Dizon',        phone: '02-82345678', address: 'Paranaque City',             creditLimit: 150000, paymentTerms: 15 },
  { name: 'Generika Pharmacy — Pasig',  contactPerson: 'Rosa Tan',          phone: '02-83456789', address: 'Pasig City',                 creditLimit: 100000, paymentTerms: 15 },
  { name: 'RxGo Community Clinic',      contactPerson: 'Dr. Ben Flores',    phone: '09301001001', address: 'Las Pinas City',             creditLimit: 80000,  paymentTerms: 30 },
  { name: 'Ospital ng Maynila',         contactPerson: 'Supply Office',     phone: '02-85256000', address: 'Manila City',                creditLimit: 300000, paymentTerms: 45 },
  { name: 'Cardinal Santos Med Center', contactPerson: 'Dr. Clara Ocampo',  phone: '02-87279444', address: 'San Juan, Metro Manila',     creditLimit: 350000, paymentTerms: 30 },
];

// ── Expenses ──────────────────────────────────────────────────────────────────────────

const EXPENSES_DATA = [
  { description: 'Cold chain logistics — NCR delivery run',    category: 'Logistics',        amount: 12500,  daysBack: 2  },
  { description: 'Warehouse rent — June 2026',                 category: 'Administrative',   amount: 45000,  daysBack: 5  },
  { description: 'Staff salaries — May 2026',                  category: 'Salaries & Wages', amount: 180000, daysBack: 7  },
  { description: 'Procurement — Amoxicillin restock',          category: 'Procurement',      amount: 38000,  daysBack: 8  },
  { description: 'Delivery van fuel — June',                   category: 'Logistics',        amount: 8500,   daysBack: 12 },
  { description: 'Regulatory compliance filing fees',          category: 'Administrative',   amount: 6200,   daysBack: 14 },
  { description: 'Cold storage electricity — May',            category: 'Utilities',        amount: 22000,  daysBack: 15 },
  { description: 'Procurement — Insulin Glargine restock',     category: 'Procurement',      amount: 65000,  daysBack: 18 },
  { description: 'Sales team training seminar',                category: 'Marketing',        amount: 15000,  daysBack: 20 },
  { description: 'Office supplies and packaging materials',    category: 'Administrative',   amount: 4800,   daysBack: 22 },
  { description: 'Vehicle maintenance — delivery van service', category: 'Maintenance',      amount: 9500,   daysBack: 25 },
  { description: 'Procurement — OTC medicines bulk purchase',  category: 'Procurement',      amount: 52000,  daysBack: 28 },
];

// ── Sales scenarios ─────────────────────────────────────────────────────────────────────────

const SALES_SCENARIOS = [
  { daysBack: 1,  customerIdx: 0, status: 'completed',       repIdx: 0 },
  { daysBack: 1,  customerIdx: 2, status: 'delivered',       repIdx: 1 },
  { daysBack: 2,  customerIdx: 1, status: 'pending_approval',repIdx: 0 },
  { daysBack: 3,  customerIdx: 4, status: 'completed',       repIdx: 2 },
  { daysBack: 3,  customerIdx: 3, status: 'delivered',       repIdx: 1 },
  { daysBack: 5,  customerIdx: 6, status: 'completed',       repIdx: 0 },
  { daysBack: 5,  customerIdx: 0, status: 'completed',       repIdx: 2 },
  { daysBack: 7,  customerIdx: 5, status: 'approved',        repIdx: 3 },
  { daysBack: 8,  customerIdx: 2, status: 'completed',       repIdx: 1 },
  { daysBack: 10, customerIdx: 1, status: 'completed',       repIdx: 0 },
  { daysBack: 12, customerIdx: 4, status: 'cancelled',       repIdx: 2 },
  { daysBack: 14, customerIdx: 3, status: 'completed',       repIdx: 1 },
  { daysBack: 15, customerIdx: 6, status: 'completed',       repIdx: 3 },
  { daysBack: 18, customerIdx: 0, status: 'completed',       repIdx: 0 },
  { daysBack: 20, customerIdx: 5, status: 'completed',       repIdx: 2 },
  { daysBack: 22, customerIdx: 2, status: 'completed',       repIdx: 1 },
  { daysBack: 25, customerIdx: 1, status: 'completed',       repIdx: 0 },
  { daysBack: 28, customerIdx: 4, status: 'completed',       repIdx: 3 },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\uD83C\uDF31  Therapevo Farmaco demo seed starting...\n');

  // ── 1. Auth: create / update demo users ────────────────────────────────────────────
  console.log('\uD83D\uDC64  Setting up demo users...');
  const userUids = {};
  for (const u of DEMO_USERS) {
    const displayName = `${u.firstName} ${u.lastName}`;
    try {
      const cred = await createUserWithEmailAndPassword(auth, u.email, u.password);
      await updateProfile(cred.user, { displayName });
      userUids[u.username] = cred.user.uid;
      console.log(`   \u2713 Created: ${u.username} (${cred.user.uid})`);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, u.email, u.password);
        userUids[u.username] = cred.user.uid;
        console.log(`   \u21bb Exists:  ${u.username} (${cred.user.uid})`);
      } else {
        console.error(`   \u2717 Failed:  ${u.username} \u2014 ${err.message}`);
        throw err;
      }
    }
  }

  // Sign in as admin for all subsequent Firestore writes
  const adminCred = await signInWithEmailAndPassword(auth, DEMO_USERS[0].email, DEMO_USERS[0].password);
  console.log(`\n\uD83D\uDD11  Signed in as admin (${adminCred.user.uid})`);

  // ── 2. Firestore: user documents ─────────────────────────────────────────────
  console.log('\n\uD83D\uDCCB  Writing user documents...');
  for (const u of DEMO_USERS) {
    const uid = userUids[u.username];
    await setDoc(doc(db, 'users', uid), {
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
      createdAt:  ts(),
      updatedAt:  ts(),
    });
    console.log(`   \u2713 ${u.username} (${u.role})`);
  }

  // ── 3. Product categories ───────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDCC2  Seeding product categories...');
  for (const cat of CATEGORIES) {
    const { id, ...data } = cat;
    await setDoc(doc(db, 'product_categories', id), { ...data, createdAt: ts(), updatedAt: ts() });
    console.log(`   \u2713 ${cat.name}`);
  }

  // ── 4. Products ─────────────────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDC8A  Seeding pharmaceutical products...');
  console.log('   \uD83D\uDDD1\uFE0F  Clearing old product data...');
  await clearCollection('products');
  await clearCollection('inventory');

  const CATEGORY_NAMES = {
    cat_rx:       'Prescription Medicine',
    cat_otc:      'Over-the-Counter',
    cat_vitamins: 'Vitamins & Supplements',
    cat_supplies: 'Medical Supplies',
    cat_equip:    'Medical Equipment',
  };

  const productIds = {};
  for (const p of PRODUCTS) {
    const ref = await addDoc(collection(db, 'products'), {
      ...p,
      category: CATEGORY_NAMES[p.categoryId] || p.categoryId,
      createdAt: ts(),
      updatedAt: ts(),
    });
    productIds[p.sku] = ref.id;
    console.log(`   \u2713 ${p.name}`);
  }

  // ── 5. Inventory ────────────────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDCE6  Seeding inventory...');
  const locations = ['Rack A', 'Rack B', 'Cold Storage', 'Shelf C', 'Rack D'];
  for (const p of PRODUCTS) {
    await addDoc(collection(db, 'inventory'), {
      productId:         productIds[p.sku],
      productName:       p.name,
      sku:               p.sku,
      stockLevel:        p.stockLevel,
      lowStockThreshold: p.lowStockThreshold,
      unit:              p.unit,
      warehouseLocation: pick(locations),
      lastRestockedAt:   ts(),
      createdAt:         ts(),
      updatedAt:         ts(),
    });
  }
  console.log(`   \u2713 ${PRODUCTS.length} inventory records`);

  // ── 6. Medical reps ───────────────────────────────────────────────────────────────────
  console.log('\n\uD83E\uDE7A  Seeding medical representatives...');
  await clearCollection('medical_reps');
  const repIds = [];
  for (const rep of MED_REPS) {
    const { linkedUsername, managedBy, ...repData } = rep;
    const userId    = userUids[linkedUsername] || null;
    const managerId = userUids[managedBy]      || null;
    const ref = await addDoc(collection(db, 'medical_reps'), {
      ...repData, userId, managerId,
      totalSales: rnd(50000, 200000),
      salesCount: rnd(20, 80),
      createdAt:  ts(),
      updatedAt:  ts(),
    });
    repIds.push(ref.id);
    console.log(`   \u2713 ${rep.name} \u2192 linked: ${linkedUsername}, manager: ${managedBy}`);
  }

  // ── 7. Accounts receivable ───────────────────────────────────────────────────────────
  console.log('\n\uD83C\uDFE5  Seeding accounts receivable...');
  console.log('   \uD83D\uDDD1\uFE0F  Clearing old AR data...');
  await clearCollection('accounts_receivable');
  await clearCollection('ar_payments');

  const adminUid = adminCred.user.uid;

  const AR_RECORDS = [
    {
      customerName: "St. Luke's Medical Center",
      customerPhone: '02-88888888',
      customerAddress: 'Quezon City, Metro Manila',
      invoiceNumber: 'INV-2026-0001',
      amount: 360000,
      amountPaid: 90000,
      balance: 270000,
      dueDate: d(2026, 7, 21),
      paymentMethod: 'credit_term',
      status: 'current',
      installmentTotal: 12,
      installmentAmount: 30000,
      installmentFrequency: 'monthly',
      firstInstallmentDue: d(2026, 2, 21),
      notes: '12-month credit arrangement. 3 of 12 installments received.',
    },
    {
      customerName: 'Makati Medical Center',
      customerPhone: '02-88888000',
      customerAddress: 'Makati City, Metro Manila',
      invoiceNumber: 'INV-2026-0002',
      amount: 180000,
      amountPaid: 60000,
      balance: 120000,
      dueDate: d(2026, 9, 25),
      paymentMethod: 'credit_term',
      status: 'current',
      installmentTotal: 6,
      installmentAmount: 30000,
      installmentFrequency: 'monthly',
      firstInstallmentDue: d(2026, 3, 25),
      notes: '6-month installment plan. 2 of 6 installments received.',
    },
    {
      customerName: 'Mercury Drug \u2014 Paranaque',
      customerPhone: '02-82345678',
      customerAddress: 'Paranaque City',
      invoiceNumber: 'INV-2026-0003',
      amount: 95500,
      amountPaid: 0,
      balance: 95500,
      dueDate: d(2026, 4, 15),
      paymentMethod: 'credit_term',
      status: 'overdue',
      installmentTotal: null,
      installmentAmount: null,
      installmentFrequency: null,
      firstInstallmentDue: null,
      notes: '30-day credit term. Follow-up required \u2014 no payment received.',
    },
    {
      customerName: 'Generika Pharmacy \u2014 Pasig',
      customerPhone: '02-83456789',
      customerAddress: 'Pasig City',
      invoiceNumber: 'INV-2026-0004',
      amount: 78400,
      amountPaid: 30000,
      balance: 48400,
      dueDate: d(2026, 6, 15),
      paymentMethod: 'credit_term',
      status: 'current',
      installmentTotal: null,
      installmentAmount: null,
      installmentFrequency: null,
      firstInstallmentDue: null,
      notes: 'Partial payment of \u20b130,000 received via bank transfer on May 10.',
    },
    {
      customerName: 'RxGo Community Clinic',
      customerPhone: '09301001001',
      customerAddress: 'Las Pinas City',
      invoiceNumber: 'INV-2026-0005',
      amount: 42800,
      amountPaid: 0,
      balance: 42800,
      dueDate: d(2026, 6, 30),
      paymentMethod: 'credit_term',
      status: 'current',
      installmentTotal: null,
      installmentAmount: null,
      installmentFrequency: null,
      firstInstallmentDue: null,
      notes: '45-day credit term. Invoice issued May 16, 2026.',
    },
    {
      customerName: 'Ospital ng Maynila',
      customerPhone: '02-85256000',
      customerAddress: 'Manila City',
      invoiceNumber: 'INV-2026-0006',
      amount: 285000,
      amountPaid: 71250,
      balance: 213750,
      dueDate: d(2026, 5, 19),
      paymentMethod: 'credit_term',
      status: 'overdue',
      installmentTotal: 4,
      installmentAmount: 71250,
      installmentFrequency: 'monthly',
      firstInstallmentDue: d(2026, 2, 19),
      notes: 'Quarterly installment plan. 2nd installment overdue since Mar 19.',
    },
    {
      customerName: 'Cardinal Santos Med Center',
      customerPhone: '02-87279444',
      customerAddress: 'San Juan, Metro Manila',
      invoiceNumber: 'INV-2026-0007',
      amount: 156000,
      amountPaid: 0,
      balance: 156000,
      dueDate: d(2027, 4, 22),
      paymentMethod: 'credit_term',
      status: 'current',
      installmentTotal: 12,
      installmentAmount: 13000,
      installmentFrequency: 'monthly',
      firstInstallmentDue: d(2026, 5, 22),
      notes: '12-month installment plan. First installment due tomorrow.',
    },
  ];

  for (const ar of AR_RECORDS) {
    await addDoc(collection(db, 'accounts_receivable'), {
      ...ar,
      createdBy: adminUid,
      createdAt: ts(),
      updatedAt: ts(),
    });
    console.log(`   \u2713 ${ar.customerName} \u2014 ${ar.invoiceNumber} (balance: \u20b1${ar.balance.toLocaleString()})`);
  }

  // ── 5. Batches ────────────────────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDCE6  Seeding batches...');
  await clearCollection('batches');

  const future = (daysFromNow) => Timestamp.fromDate(new Date(now.getTime() + daysFromNow * 864e5));

  const BATCH_DEFS = [
    { sku: 'OTC-ORS-PKT', batchNumber: 'BN-ORS-001', lotNumber: 'LOT-ORS-2023A', quantity: 30,  unitCost: 32,  expiryDays: -15,  supplier: 'PharmaCo Distributors' },
    { sku: 'SUP-MSK-3PL', batchNumber: 'BN-MSK-001', lotNumber: 'LOT-MSK-2023A', quantity: 50,  unitCost: 70,  expiryDays: -5,   supplier: 'MediSupply Inc.' },
    { sku: 'RX-SAL-INH',  batchNumber: 'BN-SAL-001', lotNumber: 'LOT-SAL-2024A', quantity: 20,  unitCost: 280, expiryDays: 12,   supplier: 'GSK Philippines' },
    { sku: 'RX-INS-GLA',  batchNumber: 'BN-INS-001', lotNumber: 'LOT-INS-2024A', quantity: 10,  unitCost: 820, expiryDays: 25,   supplier: 'Novo Nordisk PH' },
    { sku: 'OTC-CET-010', batchNumber: 'BN-CET-001', lotNumber: 'LOT-CET-2024A', quantity: 60,  unitCost: 55,  expiryDays: 45,   supplier: 'Unilab Inc.' },
    { sku: 'VIT-FES-325', batchNumber: 'BN-FES-001', lotNumber: 'LOT-FES-2024A', quantity: 80,  unitCost: 58,  expiryDays: 70,   supplier: 'Actimed Pharma' },
    { sku: 'RX-OMP-020',  batchNumber: 'BN-OMP-001', lotNumber: 'LOT-OMP-2024A', quantity: 90,  unitCost: 100, expiryDays: 85,   supplier: 'AstraZeneca PH' },
    { sku: 'RX-AMX-500',  batchNumber: 'BN-AMX-001', lotNumber: 'LOT-AMX-2024A', quantity: 120, unitCost: 210, expiryDays: 365,  supplier: 'GSK Philippines' },
    { sku: 'RX-AMX-500',  batchNumber: 'BN-AMX-002', lotNumber: 'LOT-AMX-2024B', quantity: 80,  unitCost: 215, expiryDays: 540,  supplier: 'GSK Philippines' },
    { sku: 'RX-MET-500',  batchNumber: 'BN-MET-001', lotNumber: 'LOT-MET-2024A', quantity: 200, unitCost: 130, expiryDays: 730,  supplier: 'Merck Philippines' },
    { sku: 'RX-AML-005',  batchNumber: 'BN-AML-001', lotNumber: 'LOT-AML-2024A', quantity: 150, unitCost: 120, expiryDays: 548,  supplier: 'Pfizer PH' },
    { sku: 'RX-ATO-020',  batchNumber: 'BN-ATO-001', lotNumber: 'LOT-ATO-2024A', quantity: 90,  unitCost: 230, expiryDays: 450,  supplier: 'Pfizer PH' },
    { sku: 'RX-LOS-050',  batchNumber: 'BN-LOS-001', lotNumber: 'LOT-LOS-2024A', quantity: 110, unitCost: 145, expiryDays: 395,  supplier: 'Merck Philippines' },
    { sku: 'RX-INS-GLA',  batchNumber: 'BN-INS-002', lotNumber: 'LOT-INS-2025A', quantity: 20,  unitCost: 820, expiryDays: 400,  supplier: 'Novo Nordisk PH' },
    { sku: 'OTC-PAR-500', batchNumber: 'BN-PAR-001', lotNumber: 'LOT-PAR-2024A', quantity: 350, unitCost: 70,  expiryDays: 700,  supplier: 'Unilab Inc.' },
    { sku: 'OTC-IBU-400', batchNumber: 'BN-IBU-001', lotNumber: 'LOT-IBU-2024A', quantity: 280, unitCost: 90,  expiryDays: 650,  supplier: 'Unilab Inc.' },
    { sku: 'OTC-LOP-002', batchNumber: 'BN-LOP-001', lotNumber: 'LOT-LOP-2024A', quantity: 160, unitCost: 48,  expiryDays: 500,  supplier: 'Johnson & Johnson PH' },
    { sku: 'OTC-MEF-500', batchNumber: 'BN-MEF-001', lotNumber: 'LOT-MEF-2024A', quantity: 140, unitCost: 82,  expiryDays: 480,  supplier: 'Actimed Pharma' },
    { sku: 'VIT-C-500',   batchNumber: 'BN-VTC-001', lotNumber: 'LOT-VTC-2024A', quantity: 300, unitCost: 80,  expiryDays: 600,  supplier: 'Watsons PH Supply' },
    { sku: 'VIT-D3-1K',   batchNumber: 'BN-VTD-001', lotNumber: 'LOT-VTD-2024A', quantity: 180, unitCost: 150, expiryDays: 550,  supplier: 'Nature Made PH' },
    { sku: 'VIT-BCX-TAB', batchNumber: 'BN-BCX-001', lotNumber: 'LOT-BCX-2024A', quantity: 250, unitCost: 95,  expiryDays: 720,  supplier: 'Watsons PH Supply' },
    { sku: 'VIT-OM3-1K',  batchNumber: 'BN-OM3-001', lotNumber: 'LOT-OM3-2024A', quantity: 120, unitCost: 190, expiryDays: 580,  supplier: 'Nature Made PH' },
    { sku: 'SUP-ALC-500', batchNumber: 'BN-ALC-001', lotNumber: 'LOT-ALC-2024A', quantity: 300, unitCost: 38,  expiryDays: 900,  supplier: 'MediSupply Inc.' },
    { sku: 'SUP-SYR-5ML', batchNumber: 'BN-SYR-001', lotNumber: 'LOT-SYR-2024A', quantity: 200, unitCost: 130, expiryDays: 1095, supplier: 'BD Philippines' },
    { sku: 'SUP-BGT-50',  batchNumber: 'BN-BGT-001', lotNumber: 'LOT-BGT-2024A', quantity: 80,  unitCost: 310, expiryDays: 365,  supplier: 'Roche Diagnostics PH' },
    { sku: 'SUP-GZP-4X4', batchNumber: 'BN-GZP-001', lotNumber: 'LOT-GZP-2024A', quantity: 400, unitCost: 24,  expiryDays: 1825, supplier: 'MediSupply Inc.' },
    { sku: 'EQP-BPM-DGT', batchNumber: 'BN-BPM-001', lotNumber: 'LOT-BPM-2024A', quantity: 25,  unitCost: 780, expiryDays: 1825, supplier: 'Omron Healthcare PH' },
    { sku: 'EQP-THM-DGT', batchNumber: 'BN-THM-001', lotNumber: 'LOT-THM-2024A', quantity: 40,  unitCost: 180, expiryDays: 1825, supplier: 'Omron Healthcare PH' },
    { sku: 'EQP-POX-FGR', batchNumber: 'BN-POX-001', lotNumber: 'LOT-POX-2024A', quantity: 18,  unitCost: 390, expiryDays: 1825, supplier: 'Nonin Medical PH' },
    { sku: 'OTC-ORS-PKT', batchNumber: 'BN-ORS-002', lotNumber: 'LOT-ORS-2025A', quantity: 190, unitCost: 32,  expiryDays: 400,  supplier: 'PharmaCo Distributors' },
    { sku: 'SUP-MSK-3PL', batchNumber: 'BN-MSK-002', lotNumber: 'LOT-MSK-2025A', quantity: 450, unitCost: 70,  expiryDays: 730,  supplier: 'MediSupply Inc.' },
    { sku: 'RX-SAL-INH',  batchNumber: 'BN-SAL-002', lotNumber: 'LOT-SAL-2025A', quantity: 25,  unitCost: 280, expiryDays: 365,  supplier: 'GSK Philippines' },
    { sku: 'OTC-CET-010', batchNumber: 'BN-CET-002', lotNumber: 'LOT-CET-2025A', quantity: 140, unitCost: 55,  expiryDays: 400,  supplier: 'Unilab Inc.' },
  ];

  const nearestExpiryBySku = {};
  const nearestBatchBySku  = {};
  for (const b of BATCH_DEFS) {
    const expTs = future(b.expiryDays);
    if (!nearestExpiryBySku[b.sku] || expTs.toMillis() < nearestExpiryBySku[b.sku].toMillis()) {
      nearestExpiryBySku[b.sku] = expTs;
      nearestBatchBySku[b.sku]  = { batchNumber: b.batchNumber, lotNumber: b.lotNumber };
    }
  }

  for (const b of BATCH_DEFS) {
    const pid = productIds[b.sku];
    const prod = PRODUCTS.find((p) => p.sku === b.sku);
    await addDoc(collection(db, 'batches'), {
      productId:   pid,
      productName: prod.name,
      batchNumber: b.batchNumber,
      lotNumber:   b.lotNumber,
      quantity:    b.quantity,
      remaining:   b.quantity,
      unitCost:    b.unitCost,
      expiryDate:  future(b.expiryDays),
      supplier:    b.supplier,
      notes:       '',
      createdBy:   adminUid,
      createdAt:   ago(rnd(1, 30)),
    });
  }
  console.log(`   \u2713 ${BATCH_DEFS.length} batch records`);

  console.log('   Updating product nearestExpiry, batchNumber, lotNumber...');
  for (const [sku, expTs] of Object.entries(nearestExpiryBySku)) {
    const pid = productIds[sku];
    if (pid) {
      const { batchNumber, lotNumber } = nearestBatchBySku[sku] || {};
      await updateDoc(doc(db, 'products', pid), {
        nearestExpiry: expTs,
        batchNumber:   batchNumber || '',
        lotNumber:     lotNumber   || '',
        updatedAt:     ts(),
      });
    }
  }
  console.log(`   \u2713 nearestExpiry + lot/batch set for ${Object.keys(nearestExpiryBySku).length} products`);

  // ── 8. Sales transactions ───────────────────────────────────────────────────────────
  console.log('\n\uD83E\uDDFE  Seeding sales transactions...');
  console.log('   \uD83D\uDDD1\uFE0F  Clearing old sales data...');
  await clearCollection('sales_transactions');
  await clearCollection('sale_items');

  const SCENARIO_PMETHODS = [
    'bank_transfer', 'cash',          'cash',         'gcash',
    'bank_transfer', 'check',         'bank_transfer', 'bank_transfer',
    'cash',          'bank_transfer', 'cash',          'gcash',
    'bank_transfer', 'cash',          'bank_transfer', 'check',
    'bank_transfer', 'gcash',
  ];

  for (let i = 0; i < SALES_SCENARIOS.length; i++) {
    const sd            = SALES_SCENARIOS[i];
    const customer      = CUSTOMERS[sd.customerIdx];
    const paymentMethod = SCENARIO_PMETHODS[i] || 'cash';
    const isDeducted    = ['completed', 'delivered', 'approved'].includes(sd.status);
    const paymentStatus = sd.status === 'cancelled'
      ? 'cancelled'
      : isDeducted ? 'paid' : 'pending';

    const count    = rnd(2, 5);
    const rawItems = [];
    const usedSkus = new Set();
    for (let j = 0; j < count; j++) {
      let p;
      do { p = pick(PRODUCTS); } while (usedSkus.has(p.sku));
      usedSkus.add(p.sku);
      const qty = rnd(5, 50);
      rawItems.push({
        productId:   productIds[p.sku],
        productName: p.name,
        unit:        p.unit,
        quantity:    qty,
        unitPrice:   p.price,
        totalPrice:  qty * p.price,
      });
    }

    const subtotal = rawItems.reduce((s, it) => s + it.totalPrice, 0);
    const discount = pick([0, 0, 0, Math.round(subtotal * 0.05), Math.round(subtotal * 0.1)]);
    const total    = subtotal - discount;
    const txDate   = ago(sd.daysBack);

    const txRef = await addDoc(collection(db, 'sales_transactions'), {
      transactionNumber: String(i + 1).padStart(6, '0'),
      customerName:      customer.name,
      customerPhone:     customer.phone,
      customerAddress:   customer.address,
      orderType:         ['distributor', 'walk_in', 'distributor'][sd.customerIdx % 3],
      repId:             repIds[sd.repIdx] || null,
      repName:           MED_REPS[sd.repIdx]?.name || '',
      items:             rawItems,
      subtotal,
      discount,
      total,
      paymentMethod,
      paymentStatus,
      status:            sd.status,
      stockDeducted:     isDeducted,
      submittedBy:       adminUid,
      submittedByName:   'Alex Administrador',
      assignedManagerId: '',
      notes:             '',
      createdBy:         adminUid,
      createdAt:         txDate,
      updatedAt:         txDate,
    });

    for (const item of rawItems) {
      await addDoc(collection(db, 'sale_items'), {
        transactionId: txRef.id,
        ...item,
        createdAt: txDate,
      });
    }
  }
  console.log(`   \u2713 ${SALES_SCENARIOS.length} sales transactions`);

  await setDoc(doc(db, 'system_counters', 'sales'), { current: SALES_SCENARIOS.length });
  console.log(`   \u2713 system_counters/sales \u2192 current: ${SALES_SCENARIOS.length}`);

  // ── 9. Expenses ───────────────────────────────────────────────────────────────────
  console.log('\n\uD83D\uDCB8  Seeding expenses...');
  for (const exp of EXPENSES_DATA) {
    const d = ago(exp.daysBack);
    await addDoc(collection(db, 'expenses'), {
      description:   exp.description,
      category:      exp.category,
      amount:        exp.amount,
      date:          d,
      paymentMethod: pick(['cash', 'bank_transfer', 'check']),
      status:        'approved',
      approvedBy:    'demo_admin',
      receiptUrl:    '',
      notes:         '',
      createdAt:     d,
      updatedAt:     d,
    });
  }
  console.log(`   \u2713 ${EXPENSES_DATA.length} expense records`);

  // ── 10. System settings ───────────────────────────────────────────────────────────
  console.log('\n\u2699\uFE0F   Writing system settings...');
  await setDoc(doc(db, 'system_settings', 'main'), {
    companyName:   'Therapevo Farmaco',
    address:       '123 Pharmaceutical Ave., Pasig City, Metro Manila',
    phone:         '02-8100-2026',
    email:         'info@therapevo.local',
    currency:      'PHP',
    taxRate:       12,
    isOpen:        true,
    closedMessage: '',
    createdAt:     ts(),
    updatedAt:     ts(),
  });
  console.log('   \u2713 system_settings/main');

  console.log('\n\u2705  Seed complete!\n');
  console.log('\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
  console.log('\u2502           DEMO LOGIN CREDENTIALS               \u2502');
  console.log('\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
  console.log('\u2502 Role           \u2502 Username      \u2502 Password     \u2502');
  console.log('\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
  console.log('\u2502 Admin          \u2502 demo_admin    \u2502 Demo@2026    \u2502');
  console.log('\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
  console.log('\u2502 Manager        \u2502 demo_manager1 \u2502 Demo@2026    \u2502');
  console.log('\u2502 Manager        \u2502 demo_manager2 \u2502 Demo@2026    \u2502');
  console.log('\u2502 Manager        \u2502 demo_manager3 \u2502 Demo@2026    \u2502');
  console.log('\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
  console.log('\u2502 Med Rep        \u2502 demo_medrep1  \u2502 Demo@2026    \u2502');
  console.log('\u2502 Med Rep        \u2502 demo_medrep2  \u2502 Demo@2026    \u2502');
  console.log('\u2502 Med Rep        \u2502 demo_medrep3  \u2502 Demo@2026    \u2502');
  console.log('\u2502 Med Rep        \u2502 demo_medrep4  \u2502 Demo@2026    \u2502');
  console.log('\u2502 Med Rep        \u2502 demo_medrep5  \u2502 Demo@2026    \u2502');
  console.log('\u2502 Med Rep        \u2502 demo_medrep6  \u2502 Demo@2026    \u2502');
  console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('\n\uD83C\uDF10  Demo site: https://therapevo-demo.netlify.app\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('\n\u274C  Seed failed:', err.code || err.message);
  if (err.code === 'permission-denied') {
    console.error('\n   Firestore rules are blocking writes.');
    console.error('   Go to Firebase Console \u2192 Firestore \u2192 Rules');
    console.error('   and set test mode (allow all) or deploy the project rules first.\n');
  }
  process.exit(1);
});
