import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminRoute } from "./auth/AdminRoute";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { AuditPage } from "./pages/AuditPage";
import { BackupsPage } from "./pages/BackupsPage";
import { ContainersPage } from "./pages/ContainersPage";
import { CreateDeploymentPage } from "./pages/CreateDeploymentPage";
import { DeploymentDetailPage } from "./pages/DeploymentDetailPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { DnsPage } from "./pages/DnsPage";
import { ImagesPage } from "./pages/ImagesPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UserDetailPage } from "./pages/UserDetailPage";
import { UsersPage } from "./pages/UsersPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/deployments" replace /> },
          { path: "/deployments", element: <DeploymentsPage /> },
          { path: "/deployments/new", element: <CreateDeploymentPage /> },
          { path: "/deployments/:id", element: <DeploymentDetailPage /> },
          { path: "/deployments/:id/:section", element: <DeploymentDetailPage /> },
          {
            path: "/monitoring",
            element: (
              <AdminRoute>
                <MonitoringPage />
              </AdminRoute>
            ),
          },
          { path: "/dns", element: <DnsPage /> },
          { path: "/backups", element: <BackupsPage /> },
          {
            path: "/users",
            element: (
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            ),
          },
          // Any signed-in user may open their own detail page (self-service profile/password/2FA);
          // the backend enforces self-or-admin, so others' pages 403.
          { path: "/users/:id", element: <UserDetailPage /> },
          { path: "/users/:id/:section", element: <UserDetailPage /> },
          {
            path: "/images",
            element: (
              <AdminRoute>
                <ImagesPage />
              </AdminRoute>
            ),
          },
          {
            path: "/containers",
            element: (
              <AdminRoute>
                <ContainersPage />
              </AdminRoute>
            ),
          },
          {
            path: "/audit",
            element: (
              <AdminRoute>
                <AuditPage />
              </AdminRoute>
            ),
          },
          {
            path: "/settings",
            element: (
              <AdminRoute>
                <SettingsPage />
              </AdminRoute>
            ),
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/deployments" replace /> },
]);
