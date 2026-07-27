import { ROLES } from '@/config/constants';

export const isSuperAdmin    = (user) => user?.role === ROLES.SUPER_ADMIN;
export const isCEO           = (user) => user?.role === ROLES.CEO;
export const isAdmin         = (user) => user?.role === ROLES.ADMIN;
export const isAccounting    = (user) => user?.role === ROLES.ACCOUNTING;
export const isPharmacy      = (user) => user?.role === ROLES.PHARMACY;
export const isSalesRep      = (user) => user?.role === ROLES.SALES_REP;
export const isMedRepManager = (user) => user?.role === ROLES.MED_REP_MANAGER;

export const isSuperAdminOrCEO = (user) => isSuperAdmin(user) || isCEO(user);
export const isManagement      = (user) => isSuperAdmin(user) || isCEO(user) || isAdmin(user);
export const hasFinanceAccess  = (user) => isSuperAdmin(user) || isAccounting(user) || isAdmin(user);

export const canAccessDashboard  = (user) => true;
export const canAccessCEODashboard = (user) => isSuperAdmin(user) || isCEO(user);
export const canApproveSales    = (user) => isManagement(user) || isMedRepManager(user);
export const canAccessSales      = (user) => isSuperAdmin(user) || isCEO(user) || isAdmin(user) || isAccounting(user) || isSalesRep(user) || isMedRepManager(user);
export const canManageSales      = (user) => isSuperAdmin(user) || isAdmin(user) || isSalesRep(user) || isMedRepManager(user);
export const canAccessProducts   = (user) => !isSalesRep(user) || isSuperAdmin(user);
export const canManageProducts   = (user) => isSuperAdmin(user) || isAdmin(user) || isPharmacy(user);
export const canAccessInventory  = (user) => isSuperAdmin(user) || isCEO(user) || isAdmin(user) || isPharmacy(user);
export const canManageInventory  = (user) => isSuperAdmin(user) || isAdmin(user) || isPharmacy(user);
export const canAccessAR         = (user) => isSuperAdmin(user) || isCEO(user) || isAdmin(user) || isAccounting(user);
export const canManageAR         = (user) => isSuperAdmin(user) || isAccounting(user);
export const canAccessMedReps    = (user) => isSuperAdmin(user) || isCEO(user) || isAdmin(user) || isMedRepManager(user);
export const canManageMedReps    = (user) => isSuperAdmin(user) || isAdmin(user) || isMedRepManager(user);
export const canAccessPOS        = (user) => isSuperAdmin(user) || isAdmin(user) || isSalesRep(user);
export const canAccessExpenses   = (user) => isSuperAdmin(user) || isAdmin(user) || isAccounting(user);
export const canManageExpenses   = (user) => isSuperAdmin(user) || isAccounting(user) || isAdmin(user);
export const canAccessReports    = (user) => isSuperAdmin(user) || isCEO(user) || isAdmin(user) || isAccounting(user) || isMedRepManager(user);
export const canManageUsers      = (user) => isSuperAdmin(user);
export const canManageOperations = (user) => isSuperAdmin(user) || isAdmin(user);
export const canManageSettings   = (user) => isSuperAdmin(user) || isAdmin(user);
export const canManageData       = (user) => isSuperAdmin(user) || isAdmin(user);
export const canAccessPurchaseOrders = (user) => isSuperAdmin(user) || isAdmin(user) || isPharmacy(user);
export const canManagePurchaseOrders = (user) => isSuperAdmin(user) || isAdmin(user);
