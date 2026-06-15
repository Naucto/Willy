import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { BackupsPage } from "./pages/BackupsPage";
import { CreateDeploymentPage } from "./pages/CreateDeploymentPage";
import { DeploymentDetailPage } from "./pages/DeploymentDetailPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { DnsPage } from "./pages/DnsPage";
import { LoginPage } from "./pages/LoginPage";
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
          { path: "/dns", element: <DnsPage /> },
          { path: "/backups", element: <BackupsPage /> },
          { path: "/users", element: <UsersPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/deployments" replace /> },
]);
