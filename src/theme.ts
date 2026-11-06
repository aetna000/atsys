import { createTheme } from '@mui/material/styles';
export const makeTheme = (dark: boolean) =>
  createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: dark ? '#5fd0d6' : '#1f777c' },
      success: { main: '#548548' },
      warning: { main: '#ac7b27' },
      error: { main: '#be5550' },
      background: { default: dark ? '#0d1011' : '#fafbf9', paper: dark ? '#111618' : '#ffffff' },
      text: { primary: dark ? '#f3f7f7' : '#172033', secondary: dark ? '#a9babc' : '#5f6a7c' },
    },
    typography: {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 13,
      button: { textTransform: 'none', fontWeight: 600 },
      h5: { fontWeight: 700, fontFamily: 'Manrope, "DM Sans", sans-serif' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 12, minHeight: 36, padding: '7px 14px' } },
      },
      MuiDialog: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiOutlinedInput: { styleOverrides: { root: { fontSize: 13 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
    },
  });
