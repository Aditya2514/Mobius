import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

export default function ErrorState({
  message = 'Failed to load data.',
  onRetry,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
        textAlign: 'center',
        gap: 1.5,
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 44, color: 'error.main' }} />
      <Typography variant="body1" fontWeight={500}>
        {message}
      </Typography>
      {onRetry && (
        <Button variant="outlined" size="small" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </Box>
  );
}

