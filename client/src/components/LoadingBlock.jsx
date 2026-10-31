import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

export default function LoadingBlock({ fullPage = false, message = 'Loading...' }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: fullPage ? '80vh' : 240,
        gap: 2,
      }}
    >
      <CircularProgress size={36} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );
}

