import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { UnreadProvider } from './context/UnreadContext';
import AppRoutes from './routes/AppRoutes';
import TopProgress from './components/common/TopProgress';

export default function App() {
  return (
    <BrowserRouter>
      <TopProgress />
      <ToastProvider>
        <AuthProvider>
          <UnreadProvider>
            <AppRoutes />
          </UnreadProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}