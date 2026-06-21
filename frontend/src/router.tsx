import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminRoute } from "./auth/AdminRoute";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { PageLoader } from "./components/PageLoader";

// Each page is its own lazy chunk so the initial load only pulls the shell + the landing route; heavy
// pages (charts, data grids, the console's terminal) stream in on navigation. Named exports are mapped
// to a default for React.lazy.
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DeploymentsPage = lazy(() =>
  import("./pages/DeploymentsPage").then((m) => ({ default: m.DeploymentsPage })),
);
const CreateDeploymentPage = lazy(() =>
  import("./pages/CreateDeploymentPage").then((m) => ({ default: m.CreateDeploymentPage })),
);
const DeploymentDetailPage = lazy(() =>
  import("./pages/DeploymentDetailPage").then((m) => ({ default: m.DeploymentDetailPage })),
);
const MonitoringPage = lazy(() =>
  import("./pages/MonitoringPage").then((m) => ({ default: m.MonitoringPage })),
);
const DnsPage = lazy(() => import("./pages/DnsPage").then((m) => ({ default: m.DnsPage })));
const BackupsPage = lazy(() =>
  import("./pages/BackupsPage").then((m) => ({ default: m.BackupsPage })),
);
const UsersPage = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const UserDetailPage = lazy(() =>
  import("./pages/UserDetailPage").then((m) => ({ default: m.UserDetailPage })),
);
const ImagesPage = lazy(() =>
  import("./pages/ImagesPage").then((m) => ({ default: m.ImagesPage })),
);
const ContainersPage = lazy(() =>
  import("./pages/ContainersPage").then((m) => ({ default: m.ContainersPage })),
);
const AuditPage = lazy(() => import("./pages/AuditPage").then((m) => ({ default: m.AuditPage })));
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        // AppShell wraps its <Outlet/> in a Suspense boundary, so the lazy page chunks below stream in
        // under the shell with a spinner fallback.
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
