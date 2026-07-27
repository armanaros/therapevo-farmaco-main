import { doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc, collection, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db } from '@/firebase';
import firebaseConfig from '@/config/firebase.config';
import { COLLECTIONS } from '@/config/constants';
import logger from '@/utils/logger';

const usersRef = collection(db, COLLECTIONS.USERS);

export const getUserById = async (uid) => {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const getAllUsers = async () => {
  const snap = await getDocs(usersRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getUserByUsername = async (username) => {
  const q = query(usersRef, where('username', '==', username));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
};

export const createUser = async (userData) => {
  const { username, email, password, firstName, lastName, role, phone } = userData;
  const emailToUse = email || `${username.trim().toLowerCase()}@therapevo.local`;
  const secondaryApp = initializeApp(firebaseConfig, 'secondary');
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, emailToUse, password);
    const uid = cred.user.uid;
    const resolvedRole = role || 'employee';
    await setDoc(doc(db, COLLECTIONS.USERS, uid), {
      username: username.trim().toLowerCase(),
      email: emailToUse,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: resolvedRole,
      phone: phone?.trim() || '',
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (resolvedRole === 'sales_rep') {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim() || username.trim();
      const repRef = await addDoc(collection(db, COLLECTIONS.MEDICAL_REPS), {
        name: displayName, phone: phone?.trim() || '', email: emailToUse,
        territory: '', address: '', status: 'active', quotaMonthly: 0, salesThisMonth: 0,
        notes: '', managerId: '', userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, COLLECTIONS.USERS, uid), { repId: repRef.id });
    }
    logger.info('User created:', uid);
    return { uid };
  } finally {
    await deleteApp(secondaryApp);
  }
};

export const updateUser = async (uid, data) => {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { ...data, updatedAt: serverTimestamp() });
};

export const deleteUser = async (uid) => {
  await deleteDoc(doc(db, COLLECTIONS.USERS, uid));
};

export const subscribeToUsers = (callback) => {
  return onSnapshot(usersRef, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};
