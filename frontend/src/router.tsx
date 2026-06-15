import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { CreateDeploymentPage } from "./pages/CreateDeploymentPage";
import { DeploymentDetailPage } from "./pages/DeploymentDetailPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { LoginPage } from "./pages/LoginPage";

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
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/deployments" replace /> },
]);
