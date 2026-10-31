import React from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';

/** Shown instead of the raw React Router developer error screen when a page throws. */
export default function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  if (import.meta.env.DEV) console.error(error);
  return (
    <Box sx={{ p: 6, textAlign: 'center' }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Something went wrong on this page
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        The rest of the app is fine. Try again, or go back to the start.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button variant="outlined" onClick={() => navigate('/')}>
          Go home
        </Button>
      </Box>
    </Box>
  );
}
