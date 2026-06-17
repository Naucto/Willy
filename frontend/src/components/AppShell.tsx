import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import BackupIcon from "@mui/icons-material/Backup";
import DnsIcon from "@mui/icons-material/Dns";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import HistoryIcon from "@mui/icons-material/History";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import MemoryIcon from "@mui/icons-material/Memory";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleIcon from "@mui/icons-material/People";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SettingsIcon from "@mui/icons-material/Settings";
import StorageIcon from "@mui/icons-material/Storage";
import TerminalIcon from "@mui/icons-material/Terminal";
import TuneIcon from "@mui/icons-material/Tune";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import WebhookIcon from "@mui/icons-material/Webhook";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { type ReactNode, useState } from "react";
import { Outlet, Link as RouterLink, useLocation } from "react-router-dom";
import { useDeployment, useDeploymentContainers } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { deploymentSections } from "../deploymentSections";

const DRAWER_WIDTH = 220;
const COLLAPSED_WIDTH = 64;

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const GLOBAL_NAV: NavItem[] = [
  { label: "Deployments", to: "/deployments", icon: <RocketLaunchIcon /> },
  { label: "DNS", to: "/dns", icon: <DnsIcon /> },
  { label: "Backups", to: "/backups", icon: <BackupIcon /> },
  { label: "Users", to: "/users", icon: <PeopleIcon />, adminOnly: true },
  { label: "Images", to: "/images", icon: <LayersOutlinedIcon />, adminOnly: true },
  { label: "Containers", to: "/containers", icon: <ViewInArIcon />, adminOnly: true },
];

const SECTION_ICONS: Record<string, ReactNode> = {
  overview: <InfoOutlinedIcon />,
  build: <ReceiptLongIcon />,
  runtime: <ArticleOutlinedIcon />,
  runs: <HistoryIcon />,
  console: <TerminalIcon />,
  env: <TuneIcon />,
  volumes: <StorageIcon />,
  networking: <HubOutlinedIcon />,
  domains: <LanguageIcon />,
  resources: <MemoryIcon />,
  health: <HealthAndSafetyIcon />,
  webhook: <WebhookIcon />,
  settings: <SettingsIcon />,
};

// Tabs whose content depends on the selected container — keep ?container= when navigating to them.
const CONTAINER_SCOPED = new Set(["runtime", "console", "resources", "health"]);

// Recognise a deployment-detail route (/deployments/:id[/:section]); "new" and the bare list aren't.
function matchDeployment(pathname: string): { id: string; section: string } | null {
  const match = pathname.match(/^\/deployments\/([^/]+)(?:\/([^/]+))?/);

  if (!match?.[1] || match[1] === "new") {
    return null;
  }

  return { id: match[1], section: match[2] ?? "overview" };
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(true);

  const detail = matchDeployment(location.pathname);
  // Only fetched on a deployment route (so we know whether to show Runs vs Runtime/Console).
  const { data: deployment } = useDeployment(detail?.id ?? "");
  // Container-scoped sections only make sense when there's a container to focus on.
  const { data: containers } = useDeploymentContainers(detail?.id ?? "");
  const hasContainers = (containers?.length ?? 0) > 0;

  const width = open ? DRAWER_WIDTH : COLLAPSED_WIDTH;

  const item = (key: string, to: string, label: string, icon: ReactNode, selected: boolean) => (
    <Tooltip key={key} title={label} placement="right" disableHoverListener={open}>
      <ListItemButton
        component={RouterLink}
        to={to}
        selected={selected}
        sx={{ minHeight: 48, justifyContent: open ? "initial" : "center", px: 2.5 }}
      >
        <ListItemIcon sx={{ minWidth: 0, mr: open ? 3 : 0, justifyContent: "center" }}>
          {icon}
        </ListItemIcon>
        {open && <ListItemText primary={label} />}
      </ListItemButton>
    </Tooltip>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Toggle navigation"
            onClick={() => setOpen((value) => !value)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          <Box
            component={RouterLink}
            to="/deployments"
            sx={{ display: "flex", alignItems: "center" }}
          >
            <Box
              component="img"
              src="/willy-logo.svg"
              alt="Willy"
              sx={{ height: 34, display: "block" }}
            />
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {user && (
            <Typography variant="body2" sx={{ color: "text.secondary", mr: 2 }}>
              {user.email} · {user.role}
            </Typography>
          )}

          <Button color="inherit" onClick={() => void logout()}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width,
          flexShrink: 0,
          whiteSpace: "nowrap",
          "& .MuiDrawer-paper": {
            width,
            boxSizing: "border-box",
            overflowX: "hidden",
            transition: (theme) =>
              theme.transitions.create("width", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.standard,
              }),
          },
        }}
      >
        <Toolbar />
        <List>
          {detail ? (
            <>
              {item("back", "/deployments", "Deployments", <ArrowBackIcon />, false)}
              <Divider sx={{ my: 1 }} />
              {deploymentSections(deployment?.type ?? "WEB")
                .filter((section) => hasContainers || !CONTAINER_SCOPED.has(section.key))
                .map((section) => {
                  const container = new URLSearchParams(location.search).get("container");
                  const query =
                    container && CONTAINER_SCOPED.has(section.key)
                      ? `?container=${encodeURIComponent(container)}`
                      : "";

                  return item(
                    section.key,
                    `/deployments/${detail.id}/${section.key}${query}`,
                    section.label,
                    SECTION_ICONS[section.key] ?? <InfoOutlinedIcon />,
                    detail.section === section.key,
                  );
                })}
            </>
          ) : (
            GLOBAL_NAV.filter((nav) => !nav.adminOnly || user?.role === "ADMIN").map((nav) =>
              item(nav.to, nav.to, nav.label, nav.icon, location.pathname.startsWith(nav.to)),
            )
          )}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Box sx={{ p: 4 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
