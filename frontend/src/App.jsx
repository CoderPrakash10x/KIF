import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { UnreadProvider } from './context/UnreadContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
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
