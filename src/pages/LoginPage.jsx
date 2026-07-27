import { Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import useAuth from '@/hooks/useAuth';
import LoginForm from '@/components/auth/LoginForm';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const LoginPage = () => {
  const { isAuthenticated, loading, login } = useAuth();

  if (loading) return <LoadingSpinner fullscreen />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #0A1A11 0%, #0D2F1E 50%, #0C2340 100%)',
      p: 2,
      position: 'relative',
      overflow: 'hidden',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        backgroundImage: `radial-gradient(circle at 20% 30%, rgba(22,163,74,0.12) 0%, transparent 60%),
                          radial-gradient(circle at 80% 70%, rgba(8,145,178,0.10) 0%, transparent 50%)`,
        pointerEvents: 'none',
      },
    }}>
      <LoginForm onLogin={login} />
    </Box>
  );
};

export default LoginPage;
