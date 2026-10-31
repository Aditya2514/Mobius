import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Button,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from '@mui/material';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import SubscriptionsOutlinedIcon from '@mui/icons-material/SubscriptionsOutlined';
import ReceiptOutlinedIcon from '@mui/icons-material/ReceiptOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';

export default function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* Top Customer Navigation Bar */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          color: 'text.primary',
        }}
      >
        <Container maxWidth="md">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between', minHeight: 64 }}>
            {/* Brand Logo */}
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
              onClick={() => navigate('/portal')}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  backgroundColor: 'primary.main',
                  color: '#ffffff',
                }}
              >
                <AllInclusiveIcon fontSize="small" />
              </Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Mobius Portal
              </Typography>
            </Box>

            {/* Navigation Links */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                startIcon={<SubscriptionsOutlinedIcon />}
                onClick={() => navigate('/portal')}
                sx={{
                  color: location.pathname === '/portal' ? 'primary.main' : 'text.secondary',
                  fontWeight: location.pathname === '/portal' ? 600 : 500,
                  borderBottom: location.pathname === '/portal' ? '2px solid' : 'none',
                  borderRadius: location.pathname === '/portal' ? '8px 8px 0 0' : 2,
                }}
              >
                My Subscriptions
              </Button>
              <Button
                startIcon={<ReceiptOutlinedIcon />}
                onClick={() => navigate('/portal/invoices')}
                sx={{
                  color: location.pathname.startsWith('/portal/invoices')
                    ? 'primary.main'
                    : 'text.secondary',
                  fontWeight: location.pathname.startsWith('/portal/invoices') ? 600 : 500,
                  borderBottom: location.pathname.startsWith('/portal/invoices')
                    ? '2px solid'
                    : 'none',
                  borderRadius: location.pathname.startsWith('/portal/invoices') ? '8px 8px 0 0' : 2,
                }}
              >
                My Invoices
              </Button>
            </Box>

            {/* User Avatar & Menu */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={handleMenuOpen} size="small">
                <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>
                  {user?.fullName?.charAt(0) || 'C'}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem disabled sx={{ opacity: '1 !important' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {user?.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {user?.email}
                    </Typography>
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    handleMenuClose();
                    navigate('/portal/profile');
                  }}
                >
                  <ListItemIcon>
                    <PersonOutlineOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  Profile & Billing Info
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  Log Out
                </MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Main Content (Max-width 960px centered) */}
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}

