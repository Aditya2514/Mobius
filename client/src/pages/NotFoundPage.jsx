import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../auth/AuthContext';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <Typography variant="h1" fontWeight={800} color="primary.main" sx={{ fontSize: '6rem', lineHeight: 1 }}>
          404
        </Typography>
        <Typography variant="h5" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
          Page Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 420 }}>
          The page you are looking for does not exist, has been removed, or is not accessible.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate(user ? homeFor(user.role) : '/login')}
        >
          Return Home
        </Button>
      </Box>
    </Container>
  );
}

