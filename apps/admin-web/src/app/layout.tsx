import '@/styles/globals.scss';
import '@ant-design/v5-patch-for-react-19';

import { ProtectedRoute } from '../components/auth/protected-route';
import { AntdRegistry } from '@ant-design/nextjs-registry';

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const metadata = {
  title: 'Flash Sale Admin',
  description: 'Flash Sale Admin Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <ProtectedRoute>{children}</ProtectedRoute>
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
          />
        </AntdRegistry>
      </body>
    </html>
  );
}
