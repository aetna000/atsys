import { createTheme } from '@mui/material/styles';
export const makeTheme = (dark: boolean) =>
  createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: dark ? '#b2da81' : '#406b3b' },
      success: { main: '#548548' },
      warning: { main: '#ac7b27' },
      error: { main: '#be5550' },
      background: { default: dark ? '#17221d' : '#f5f6f3', paper: dark ? '#1d2a23' : '#ffffff' },
      text: { primary: dark ? '#edf2e8' : '#243127', secondary: dark ? '#acb8ad' : '#7b837b' },
    },
    typography: {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 600 },
      h5: { fontWeight: 650 },
    },
    shape: { borderRadius: 9 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 7, minHeight: 36, padding: '7px 14px' } },
      },
      MuiDialog: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiOutlinedInput: { styleOverrides: { root: { fontSize: 13 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
    },
  });
