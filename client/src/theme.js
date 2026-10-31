import { createTheme } from '@mui/material/styles';

/** Matches the login screen: near-black base, purple/pink/cyan glow, frosted glass panels. */
const BG = '#06060a';
const GLASS = 'rgba(12, 12, 20, 0.72)';
const GLASS_SOFT = 'rgba(255, 255, 255, 0.04)';
const LINE = 'rgba(255, 255, 255, 0.10)';
const LINE_SOFT = 'rgba(255, 255, 255, 0.06)';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#a78bfa', light: '#c4b5fd', dark: '#7c3aed', contrastText: '#0b0b12' },
    secondary: { main: '#c084fc' },
    success: { main: '#4ade80' },
    error: { main: '#f87171' },
    warning: { main: '#fbbf24' },
    info: { main: '#38bdf8' },
    background: { default: BG, paper: GLASS },
    text: { primary: '#f4f4f8', secondary: 'rgba(255, 255, 255, 0.62)' },
    divider: LINE,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: BG,
          backgroundAttachment: 'fixed',
          backgroundImage: [
            'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)',
            'radial-gradient(600px 460px at 18% -4%, rgba(126,34,206,0.38), transparent 70%)',
            'radial-gradient(640px 520px at 86% 104%, rgba(219,39,119,0.24), transparent 70%)',
            'radial-gradient(520px 420px at 96% 6%, rgba(8,145,178,0.16), transparent 70%)',
          ].join(','),
          backgroundSize: '28px 28px, auto, auto, auto',
        },
        '::selection': { background: 'rgba(167,139,250,0.4)' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.14)', borderRadius: 8 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        // primary actions are white, like the Sign In button on the login screen
        containedPrimary: {
          backgroundColor: '#ffffff',
          color: '#09090f',
          '&:hover': { backgroundColor: '#ececf2' },
          '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.35)' },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.18)',
          color: '#e9e5ff',
          '&:hover': { borderColor: 'rgba(196,181,253,0.6)', backgroundColor: 'rgba(167,139,250,0.08)' },
        },
        text: { color: '#c4b5fd' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: GLASS,
          backdropFilter: 'blur(18px)',
          border: `1px solid ${LINE}`,
          boxShadow: '0 20px 50px -20px rgba(0,0,0,0.8), 0 0 30px rgba(168,85,247,0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: GLASS },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(14,14,24,0.94)',
          backdropFilter: 'blur(24px)',
          border: `1px solid ${LINE}`,
          borderRadius: 16,
        },
      },
    },
    MuiMenu: { styleOverrides: { paper: { backgroundColor: 'rgba(14,14,24,0.96)', border: `1px solid ${LINE}` } } },
    MuiPopover: { styleOverrides: { paper: { backgroundColor: 'rgba(14,14,24,0.96)', border: `1px solid ${LINE}` } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 10,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.28)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(192,132,252,0.65)',
            borderWidth: 1,
          },
          '&.Mui-focused': { boxShadow: '0 0 12px rgba(168,85,247,0.18)' },
        },
      },
    },
    MuiTabs: { styleOverrides: { indicator: { backgroundColor: '#c084fc', height: 2 } } },
    MuiTab: { styleOverrides: { root: { color: 'rgba(255,255,255,0.55)', '&.Mui-selected': { color: '#ffffff' } } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${LINE_SOFT}` },
        head: { color: 'rgba(255,255,255,0.7)', backgroundColor: 'transparent' },
      },
    },
    MuiTableRow: { styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: 'rgba(167,139,250,0.07)' } } } },
    MuiDivider: { styleOverrides: { root: { borderColor: LINE } } },
    MuiChip: { styleOverrides: { outlined: { borderColor: 'rgba(255,255,255,0.22)' } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#1b1b2b', border: `1px solid ${LINE}` } } },
    MuiMenuItem: { styleOverrides: { root: { '&:hover': { backgroundColor: 'rgba(167,139,250,0.12)' } } } },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: `1px solid ${LINE}`,
          borderRadius: 16,
          backgroundColor: GLASS,
          backdropFilter: 'blur(18px)',
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: GLASS_SOFT,
            borderBottom: `1px solid ${LINE}`,
          },
          '& .MuiDataGrid-columnSeparator': { color: LINE },
          '& .MuiDataGrid-cell': { borderBottom: `1px solid ${LINE_SOFT}` },
          '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${LINE}` },
          '& .MuiDataGrid-row:hover': { backgroundColor: 'rgba(167,139,250,0.08)' },
          '& .MuiDataGrid-overlay': { backgroundColor: 'transparent' },
        },
      },
    },
  },
});
