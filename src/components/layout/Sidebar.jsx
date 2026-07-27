import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  IconButton,
  Divider,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Dashboard,
  ReceiptLong,
  Medication,
  Inventory2,
  AccountBalanceWallet,
  Badge,
  Analytics,
  People,
  Settings,
  ChevronLeft,
  ChevronRight,
  LocalPharmacy,
} from '@mui/icons-material';
import { DRAWER_WIDTH, DRAWER_COLLAPSED_WIDTH } from '@/config/constants';
import useAuth from '@/hooks/useAuth';

const Sidebar = ({ mobileOpen, onMobileClose, collapsed, onCollapseToggle }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    isSalesRep,
    isMedRepManager,
    canAccessPOS,
    canAccessSales,
    canManageProducts,
    canAccessInventory,
    canAccessAR,
    canAccessMedReps,
    canAccessReports,
    canManageUsers,
    canManageSettings,
  } = useAuth();

  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const isRepRole     = isSalesRep?.();
  const isManagerRole = isMedRepManager?.();

  // Grouped navigation for pharma distributor
  // Med reps see a limited portal-only nav; managers & admins see full nav
  const navGroups = isRepRole ? [
    {
      label: 'MY PORTAL',
      items: [
        { label: 'My Sales Portal', icon: <Badge />,    path: '/med-rep',  show: true },
        { label: 'Profile',         icon: <People />,   path: '/profile',  show: true },
      ],
    },
  ] : [
    {
      label: 'OVERVIEW',
      items: [
        { label: 'Dashboard',  icon: <Dashboard />,            path: '/dashboard',           show: true },
      ],
    },
    {
      label: 'DISTRIBUTION',
      items: [
        { label: 'Sales Orders',      icon: <ReceiptLong />,          path: '/sales',               show: canAccessSales?.() },
        { label: 'Drug Catalog',      icon: <Medication />,           path: '/products',            show: canManageProducts?.() },
        { label: 'Inventory',         icon: <Inventory2 />,           path: '/inventory',           show: canAccessInventory?.() },
      ],
    },
    {
      label: 'FINANCE',
      items: [
        { label: 'Receivables',       icon: <AccountBalanceWallet />, path: '/accounts-receivable', show: canAccessAR?.() },
        { label: 'Reports',           icon: <Analytics />,            path: '/reports',             show: canAccessReports?.() },
      ],
    },
    {
      label: 'ADMINISTRATION',
      items: [
        { label: 'Med Reps',          icon: <Badge />,                path: '/medical-reps',        show: canAccessMedReps?.() },
        { label: 'Users',             icon: <People />,               path: '/users',               show: canManageUsers?.() },
        { label: 'Settings',          icon: <Settings />,             path: '/settings',            show: canManageSettings?.() },
      ],
    },
  ];

  // Flat list used for collapsed mode (no group labels)
  const menuItems = navGroups.flatMap((g) => g.items);

  const currentWidth = collapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH;

  const handleNavigate = (path) => {
    navigate(path);
    if (isMobile) onMobileClose();
  };

  // Sidebar design tokens
  const SB = {
    bg:           '#0D1F15',
    bgBrand:      '#0A1A11',
    textActive:   '#86EFAC',
    iconActive:   '#86EFAC',
    bgActive:     'rgba(34,197,94,0.13)',
    borderActive: '#22C55E',
    textInactive: '#A4BFB0',
    iconInactive: '#6B907D',
    bgHover:      'rgba(255,255,255,0.05)',
    divider:      'rgba(34,197,94,0.15)',
    userName:     '#D1FAE5',
    userRole:     '#6B907D',
    collapseBtn:  '#6B907D',
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: SB.bg }}>
      {/* Logo / Brand */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: collapsed ? 1.5 : 2.5,
          py: 2,
          minHeight: 64,
          justifyContent: collapsed ? 'center' : 'flex-start',
          bgcolor: SB.bgBrand,
          borderBottom: `1px solid ${SB.divider}`,
        }}
      >
        {collapsed ? (
          <Box
            component="img"
            src="/logo.jpg"
            alt="Therapevo"
            sx={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 1 }}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              component="img"
              src="/logo.jpg"
              alt="Therapevo Farmaco"
              sx={{ height: 38, width: 'auto', maxWidth: 130, objectFit: 'contain', borderRadius: 1 }}
            />
            <Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#86EFAC', lineHeight: 1.2, letterSpacing: '0.05em' }}>
                Therapevo Farmaco
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', color: SB.textInactive, lineHeight: 1.2, letterSpacing: '0.04em' }}>
                Pharma Distribution
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2 },
      }}>
        {collapsed ? (
          // Collapsed: flat list with tooltips, no group labels
          <List sx={{ px: 0.5 }}>
            {menuItems.filter((item) => item.show).map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Tooltip key={item.path} title={item.label} placement="right" arrow>
                  <ListItemButton
                    onClick={() => handleNavigate(item.path)}
                    sx={{
                      borderRadius: 1.5, mb: 0.5,
                      justifyContent: 'center',
                      px: 1, py: 0.9,
                      backgroundColor: isActive ? SB.bgActive : 'transparent',
                      color: isActive ? SB.textActive : SB.textInactive,
                      '&:hover': { backgroundColor: isActive ? SB.bgActive : SB.bgHover },
                      '& .MuiListItemIcon-root': { color: isActive ? SB.iconActive : SB.iconInactive },
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0 }}>{item.icon}</ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              );
            })}
          </List>
        ) : (
          // Expanded: grouped nav with section labels
          navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.show);
            if (visibleItems.length === 0) return null;
            return (
              <Box key={group.label} sx={{ mb: 1 }}>
                <Typography sx={{
                  px: 2.5, pt: 1.5, pb: 0.5,
                  fontSize: '0.62rem', fontWeight: 700,
                  color: 'rgba(164,191,176,0.5)',
                  letterSpacing: '0.1em',
                }}>
                  {group.label}
                </Typography>
                <List disablePadding sx={{ px: 1 }}>
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <ListItemButton
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        sx={{
                          borderRadius: 1.5, mb: 0.5,
                          px: 1.5, py: 0.75,
                          backgroundColor: isActive ? SB.bgActive : 'transparent',
                          color: isActive ? SB.textActive : SB.textInactive,
                          borderLeft: isActive ? `3px solid ${SB.borderActive}` : '3px solid transparent',
                          '&:hover': {
                            backgroundColor: isActive ? SB.bgActive : SB.bgHover,
                            color: isActive ? SB.textActive : '#C7DDD5',
                            '& .MuiListItemIcon-root': { color: isActive ? SB.iconActive : '#9AB8AC' },
                          },
                          '& .MuiListItemIcon-root': { color: isActive ? SB.iconActive : SB.iconInactive },
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            fontSize: '0.845rem',
                            fontWeight: isActive ? 600 : 400,
                            letterSpacing: isActive ? '0.01em' : 0,
                          }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Box>
            );
          })
        )}
      </Box>

      <Divider sx={{ borderColor: SB.divider }} />

      {/* Collapse toggle (not shown on mobile) */}
      {!isMobile && (
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
          <IconButton
            onClick={onCollapseToggle}
            size="small"
            sx={{ color: SB.collapseBtn, '&:hover': { bgcolor: SB.bgHover, color: SB.textActive } }}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        </Box>
      )}

      {/* User info */}
      {!collapsed && (
        <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${SB.divider}` }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: SB.userName }}>
            {user?.firstName} {user?.lastName}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: SB.userRole, textTransform: 'capitalize' }}>
            {user?.role}
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {/* Mobile drawer (temporary overlay) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH,
            backgroundColor: '#0D1F15',
            border: 'none',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop/tablet drawer (permanent) */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: currentWidth,
            backgroundColor: '#0D1F15',
            border: 'none',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            overflowX: 'hidden',
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </>
  );
};

export default Sidebar;
