import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { PageSkeleton } from '@/components/ui';
import { LoginPage } from '@/pages/Login';
import { RegisterPage } from '@/pages/Register';
import { ForgotPasswordPage } from '@/pages/ForgotPassword';
import { ResetPasswordPage } from '@/pages/ResetPassword';
import { VerifyEmailPage } from '@/pages/VerifyEmail';
import { CalculatorPage } from '@/pages/Calculator';
// El Dashboard carga Recharts (pesado): se separa en su propio chunk bajo demanda.
const DashboardPage = lazy(() =>
  import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
import { SalesPage } from '@/pages/Sales';
import { ExpensesPage } from '@/pages/Expenses';
import { QuotesPage } from '@/pages/Quotes';
import { QuoteDetailPage } from '@/pages/QuoteDetail';
import { OrdersPage } from '@/pages/Orders';
import { OrderDetailPage } from '@/pages/OrderDetail';
import { CalendarPage } from '@/pages/Calendar';
import { ReceivablesPage } from '@/pages/Receivables';
// La lista de Publicidad carga Recharts (gráficos) → chunk aparte bajo demanda.
const CampaignsPage = lazy(() => import('@/pages/Campaigns').then((m) => ({ default: m.CampaignsPage })));
import { CampaignDetailPage } from '@/pages/CampaignDetail';
import { ProductsPage } from '@/pages/Products';
import { ProductDetailPage } from '@/pages/ProductDetail';
// CRM: cargan Leaflet (pesado) → chunk aparte bajo demanda.
const ContactsPage = lazy(() => import('@/pages/Contacts').then((m) => ({ default: m.ContactsPage })));
const ContactDetailPage = lazy(() =>
  import('@/pages/ContactDetail').then((m) => ({ default: m.ContactDetailPage })),
);
const ContactsMapPage = lazy(() =>
  import('@/pages/ContactsMap').then((m) => ({ default: m.ContactsMapPage })),
);
import { PublicOrderPage } from '@/pages/PublicOrder';
import { SettingsPage } from '@/pages/Settings';
import { CatalogPage } from '@/pages/Catalog';
import { AdminPage } from '@/pages/Admin';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-brand-yellow/70 shadow-glow-sm" aria-label="Cargando" />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Público, SIN autenticación: el token del pedido es la credencial. */}
      <Route path="/p/orders/:token" element={<PublicOrderPage />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<CalculatorPage />} />
        <Route
          path="/dashboard"
          element={
            <Suspense
              fallback={<PageSkeleton />}
            >
              <DashboardPage />
            </Suspense>
          }
        />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/quotes/:id" element={<QuoteDetailPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/receivables" element={<ReceivablesPage />} />
        <Route
          path="/campaigns"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <CampaignsPage />
            </Suspense>
          }
        />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route
          path="/contacts"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <ContactsPage />
            </Suspense>
          }
        />
        <Route
          path="/contacts/:id"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <ContactDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/map"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <ContactsMapPage />
            </Suspense>
          }
        />
        <Route path="/catalogs/:resource" element={<CatalogPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
