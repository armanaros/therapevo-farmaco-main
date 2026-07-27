import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Box,
  Badge,
  useMediaQuery,
  useTheme,
  Divider,
  Button,
  Tabs,
  Tab,
  Chip,
  Dialog,
  DialogContent,
  DialogActions,
  Stack,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Person,
  Logout,
  Notifications,
  NotificationsActive,
  Circle,
  Inventory,
  Campaign,
  Info,
  Close,
  Science,
} from '@mui/icons-material';
import useAuth from '@/hooks/useAuth';
import { useNotifications } from '@/contexts/NotificationContext';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

const pageTitles = {
  '/dashboard':           'Dashboard',
  '/pos':                 'Point of Sale',
  '/sales':               'Sales Management',
  '/products':            'Product Catalog',
  '/inventory':           'Inventory Management',
  '/accounts-receivable': 'Accounts Receivable',
  '/medical-reps':        'Medical Representatives',
  '/logistics':           'Logistics & Deliveries',
  '/expenses':            'Expenses',
  '/reports':             'Reports',
  '/users':               'User Management',
  '/profile':             'My Profile',
  '/settings':            'Settings',
};

const TopBar = ({ drawerWidth, onMenuClick }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isManagement } = useAuth();
  const { lowStockItems, lowStockCount, visibleStockItems, visibleStockCount, hasDismissedStock, dismissStockItem, clearDismissedStock, systemAlerts, announcements, hasUnread, markAsRead, totalAlertCount, dismissAlert, userNotifications, markNotificationRead, markAllNotificationsRead } = useNotifications();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [anchorEl, setAnchorEl] = useState(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const [notifTab, setNotifTab] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const pageTitle = pageTitles[location.pathname] || 'Dashboard';
  const showStockAlerts = isManagement?.();
  const badgeCount = (showStockAlerts ? (totalAlertCount - userNotifications.length) : (hasUnread ? 1 : 0)) + userNotifications.length;

  const handleProfileMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleProfileMenuClose = () => setAnchorEl(null);

  const handleNotifOpen = (e) => setNotifAnchorEl(e.currentTarget);
  const handleNotifClose = () => setNotifAnchorEl(null);

  const handleLogout = async () => {
    handleProfileMenuClose();
    await logout();
    navigate('/login');
  };

  const handleProfile = () => {
    handleProfileMenuClose();
    navigate('/profile');
  };

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          backgroundColor: '#ffffff',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          borderTop: '3px solid',
          borderTopColor: 'primary.main',
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          {/* Left side */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isMobile && (
              <IconButton edge="start" onClick={onMenuClick} sx={{ mr: 1 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h5" noWrap sx={{ fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary' }}>
              {pageTitle}
            </Typography>
            {IS_DEMO && (
              <Chip
                icon={<Science sx={{ fontSize: '14px !important' }} />}
                label="DEMO MODE"
                size="small"
                color="warning"
                sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }}
              />
            )}
          </Box>

          {/* Right side */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Notifications */}
            <IconButton onClick={handleNotifOpen} size="large">
              <Badge badgeContent={badgeCount} color="error">
                <Notifications />
              </Badge>
            </IconButton>

            {/* Profile avatar */}
            <IconButton onClick={handleProfileMenuOpen} sx={{ p: 0.5 }}>
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: 'primary.main',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                }}
              >
                {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 200, mt: 1 } } }}
      >
        <MenuItem onClick={handleProfile}>
          <ListItemIcon><Person fontSize="small" /></ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>

      {/* Notifications menu */}
      <Menu
        anchorEl={notifAnchorEl}
        open={Boolean(notifAnchorEl)}
        onClose={handleNotifClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 360, mt: 1, maxHeight: 480 } } }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Notification Center
          </Typography>
          <Chip label={badgeCount} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
        </Box>
        <Divider />
        <Tabs value={notifTab} onChange={(_, v) => setNotifTab(v)} variant="fullWidth" sx={{ minHeight: 36 }}>
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Inventory sx={{ fontSize: 16 }} /> Stock ({visibleStockCount})</Box>} sx={{ minHeight: 36, py: 0.5, fontSize: '0.75rem' }} />
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Info sx={{ fontSize: 16 }} /> System ({systemAlerts.length})</Box>} sx={{ minHeight: 36, py: 0.5, fontSize: '0.75rem' }} />
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Campaign sx={{ fontSize: 16 }} /> News ({announcements.length})</Box>} sx={{ minHeight: 36, py: 0.5, fontSize: '0.75rem' }} />
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><NotificationsActive sx={{ fontSize: 16 }} /> Alerts {userNotifications.length > 0 && <Chip label={userNotifications.length} size="small" color="error" sx={{ height: 16, fontSize: '0.65rem', ml: 0.3 }} />}</Box>} sx={{ minHeight: 36, py: 0.5, fontSize: '0.75rem' }} />
        </Tabs>
        <Divider />
        <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
          {notifTab === 0 && (
            showStockAlerts && visibleStockItems.length > 0 ? (
              <>
                {hasDismissedStock && (
                  <Box sx={{ px: 2, py: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="small" color="inherit" sx={{ fontSize: '0.72rem' }} onClick={clearDismissedStock}>
                      Restore dismissed
                    </Button>
                  </Box>
                )}
                {visibleStockItems.map((item) => {
                  const isOut = (item.stockLevel || 0) <= 0;
                  return (
                    <MenuItem
                      key={item.id}
                      sx={{ py: 1, gap: 1.5, cursor: 'pointer' }}
                      onClick={() => { handleNotifClose(); navigate('/inventory'); }}
                    >
                      <Circle sx={{ fontSize: 10, color: isOut ? 'error.main' : 'warning.main', flexShrink: 0 }} />
                      <ListItemText
                        primary={item.name}
                        secondary={isOut ? 'Out of stock — click to view in Inventory' : `${item.stockLevel} left (min: ${item.lowStockThreshold || 5})`}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 600, color: isOut ? 'error.main' : 'text.primary' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); dismissStockItem(item.id); }}
                        title="Mark as read"
                      >
                        <Close fontSize="small" />
                      </IconButton>
                    </MenuItem>
                  );
                })}
              </>
            ) : (
              <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">All stock levels are healthy</Typography>
                {hasDismissedStock && (
                  <Button size="small" color="inherit" sx={{ mt: 1, fontSize: '0.72rem' }} onClick={clearDismissedStock}>
                    Restore dismissed items
                  </Button>
                )}
              </Box>
            )
          )}
          {/* System Tab */}
          {notifTab === 1 && (
            systemAlerts.length > 0 ? (
              systemAlerts.map((alert) => (
                <MenuItem key={alert.id} sx={{ py: 1, gap: 1 }}>
                  <Circle sx={{ fontSize: 10, color: alert.type === 'warning' ? 'warning.main' : 'info.main' }} />
                  <ListItemText
                    primary={alert.title}
                    secondary={alert.message}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <IconButton size="small" onClick={() => dismissAlert(alert.id)}>
                    <Close fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))
            ) : (
              <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No system alerts</Typography>
              </Box>
            )
          )}
          {/* Announcements Tab */}
          {notifTab === 2 && (
            announcements.length > 0 ? (
              <>
                {hasUnread && (
                  <Box sx={{ px: 2, py: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={markAsRead}>Mark all as read</Button>
                  </Box>
                )}
                {announcements.slice(0, 5).map((ann) => (
                  <MenuItem
                    key={ann.id}
                    sx={{ py: 1, gap: 1, cursor: 'pointer' }}
                    onClick={() => { setSelectedAnnouncement(ann); markAsRead(); }}
                  >
                    <Campaign sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
                    <ListItemText
                      primary={ann.title || 'Announcement'}
                      secondary={ann.message?.slice(0, 60) + (ann.message?.length > 60 ? '…' : '')}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </MenuItem>
                ))}
              </>
            ) : (
              <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No announcements</Typography>
              </Box>
            )
          )}
          {/* My Alerts Tab */}
          {notifTab === 3 && (
            userNotifications.length > 0 ? (
              <>
                <Box sx={{ px: 2, py: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={markAllNotificationsRead}>Mark all as read</Button>
                </Box>
                {userNotifications.map((n) => (
                  <MenuItem key={n.id} sx={{ py: 1, gap: 1, alignItems: 'flex-start' }}>
                    <NotificationsActive sx={{ fontSize: 18, color: 'error.main', mt: 0.3, flexShrink: 0 }} />
                    <ListItemText
                      primary={n.title}
                      secondary={n.message}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 600, color: 'error.main' }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { whiteSpace: 'normal' } }}
                    />
                    <IconButton size="small" onClick={() => markNotificationRead(n.id)}>
                      <Close fontSize="small" />
                    </IconButton>
                  </MenuItem>
                ))}
              </>
            ) : (
              <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No new alerts</Typography>
              </Box>
            )
          )}
        </Box>
      <Divider />
      </Menu>

      {/* Announcement detail dialog */}
      <Dialog
        open={!!selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        maxWidth="sm"
        fullWidth
      >
        {/* Header banner */}
        <Box sx={{
          background: 'linear-gradient(135deg, #15803D 0%, #16A34A 100%)',
          px: 3, py: 2,
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <Campaign sx={{ color: '#fff', fontSize: 28 }} />
          <Typography variant="h6" fontWeight={700} color="#fff" sx={{ lineHeight: 1.3 }}>
            {selectedAnnouncement?.title || 'Announcement'}
          </Typography>
        </Box>

        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          {/* Meta row */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Chip
              size="small"
              label={selectedAnnouncement?.authorName?.includes('@') ? 'Admin' : selectedAnnouncement?.authorName || 'Admin'}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
            {selectedAnnouncement?.createdAt?.toDate && (
              <Typography variant="caption" color="text.secondary">
                {selectedAnnouncement.createdAt.toDate().toLocaleString()}
              </Typography>
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Message body */}
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {selectedAnnouncement?.message}
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSelectedAnnouncement(null)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TopBar;
