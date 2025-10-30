import './global.css';
import { AuthProvider } from '@/components/auth/auth-provider';

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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
