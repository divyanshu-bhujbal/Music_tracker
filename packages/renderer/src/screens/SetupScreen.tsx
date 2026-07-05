import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function SetupScreen() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
      }}
    >
      <Typography variant="h6" color="text.secondary">
        Setup (not yet implemented)
      </Typography>
    </Box>
  );
}
