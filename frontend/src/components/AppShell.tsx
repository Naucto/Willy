import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import BackupIcon from "@mui/icons-material/Backup";
import DnsIcon from "@mui/icons-material/Dns";
import FolderIcon from "@mui/icons-material/Folder";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import HistoryIcon from "@mui/icons-material/History";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import InsightsIcon from "@mui/icons-material/Insights";
import LanguageIcon from "@mui/icons-material/Language";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MemoryIcon from "@mui/icons-material/Memory";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleIcon from "@mui/icons-material/People";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ShowChartIcon from "@mui/icons-material/ShowChart";
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
  Fade,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
} from "@mui/material";
import { type ReactNode, Suspense, useState } from "react";
import { Outlet, Link as RouterLink, useLocation } from "react-router-dom";
import { useDeployment, useDeploymentContainers } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useCan } from "../auth/permissions";
import { deploymentSections } from "../deploymentSections";
import { userSections } from "../userSections";
import { AccountMenu } from "./AccountMenu";
import { ActivityMenu } from "./ActivityMenu";
import { ErrorBoundary } from "./ErrorBoundary";
import { PageLoader } from "./PageLoader";
import { SlideFade } from "./SlideFade";

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
  { label: "Monitoring", to: "/monitoring", icon: <InsightsIcon />, adminOnly: true },
  { label: "DNS", to: "/dns", icon: <DnsIcon /> },
  { label: "Images", to: "/images", icon: <LayersOutlinedIcon />, adminOnly: true },
  { label: "Containers", to: "/containers", icon: <ViewInArIcon />, adminOnly: true },
  { label: "Backups", to: "/backups", icon: <BackupIcon /> },
  { label: "Users", to: "/users", icon: <PeopleIcon />, adminOnly: true },
  { label: "Audit", to: "/audit", icon: <ReceiptLongIcon />, adminOnly: true },
  { label: "Settings", to: "/settings", icon: <SettingsIcon />, adminOnly: true },
];

const SECTION_ICONS: Record<string, ReactNode> = {
  overview: <InfoOutlinedIcon />,
  build: <ReceiptLongIcon />,
  runtime: <ArticleOutlinedIcon />,
  runs: <HistoryIcon />,
  console: <TerminalIcon />,
  env: <TuneIcon />,
  volumes: <StorageIcon />,
  files: <FolderIcon />,
  backups: <BackupIcon />,
  networking: <HubOutlinedIcon />,
  domains: <LanguageIcon />,
  resources: <MemoryIcon />,
  monitoring: <ShowChartIcon />,
  health: <HealthAndSafetyIcon />,
  webhook: <WebhookIcon />,
  settings: <SettingsIcon />,
};

// Tabs whose content depends on the selected container — keep ?container= when navigating to them.
const CONTAINER_SCOPED = new Set(["runtime", "console", "resources", "health"]);

const USER_SECTION_ICONS: Record<string, ReactNode> = {
  general: <PersonOutlineIcon />,
  security: <LockOutlinedIcon />,
  twofa: <ShieldOutlinedIcon />,
};

// Recognise a deployment-detail route (/deployments/:id[/:section]); "new" and the bare list aren't.
function matchDeployment(pathname: string): { id: string; section: string } | null {
  const match = pathname.match(/^\/deployments\/([^/]+)(?:\/([^/]+))?/);

  if (!match?.[1] || match[1] === "new") {
    return null;
  }

  return { id: match[1], section: match[2] ?? "overview" };
}

// Recognise a user-detail route (/users/:id[/:section]); the bare list isn't.
function matchUser(pathname: string): { id: string; section: string } | null {
  const match = pathname.match(/^\/users\/([^/]+)(?:\/([^/]+))?/);

  if (!match?.[1]) {
    return null;
  }

  return { id: match[1], section: match[2] ?? "general" };
}

export function AppShell() {
  const { logout } = useAuth();
  const canAdmin = useCan("admin");
  const location = useLocation();
  const [open, setOpen] = useState(true);

  const detail = matchDeployment(location.pathname);
  const userDetail = matchUser(location.pathname);
  // Only fetched on a deployment route (so we know whether to show Runs vs Runtime/Console).
  const { data: deployment } = useDeployment(detail?.id ?? "");
  // Container-scoped sections only make sense when there's a container to focus on.
  const { data: containers } = useDeploymentContainers(detail?.id ?? "");
  const hasContainers = (containers?.length ?? 0) > 0;

  const width = open ? DRAWER_WIDTH : COLLAPSED_WIDTH;

  // Icon stays at a constant left offset in both states; the label is always mounted and revealed
  // as the drawer widens (clipped by the paper's overflowX while collapsed), so nothing slides.
  const item = (key: string, to: string, label: string, icon: ReactNode, selected: boolean) => (
    <Tooltip key={key} title={label} placement="right" disableHoverListener={open}>
      <ListItemButton
        component={RouterLink}
        to={to}
        selected={selected}
        sx={{ minHeight: 48, justifyContent: "flex-start", px: 2.5 }}
      >
        <ListItemIcon sx={{ minWidth: 0, mr: 3, justifyContent: "center" }}>{icon}</ListItemIcon>
        <ListItemText
          primary={label}
          sx={{
            my: 0,
            opacity: open ? 1 : 0,
            transition: (theme) =>
              theme.transitions.create("opacity", {
                duration: theme.transitions.duration.standard,
              }),
          }}
        />
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

          <ActivityMenu />
          <AccountMenu />

          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            sx={{ ml: 1 }}
            onClick={() => void logout()}
          >
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
          // Animate the root width too (not just the paper) so the main content reflows in sync
          // instead of snapping to the new width while the drawer is still animating.
          transition: (theme) =>
            theme.transitions.create("width", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.standard,
            }),
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
        {/* Drill animation: the sub-sidebar enters from the right, the global nav from the left. */}
        <SlideFade
          key={userDetail ? `u-${userDetail.id}` : detail ? `d-${detail.id}` : "global"}
          direction={userDetail || detail ? "right" : "left"}
        >
          <List>
            {userDetail ? (
              <>
                {/* Admins came from the Users list; everyone else is on their own account page. */}
                {canAdmin
                  ? item("back", "/users", "Users", <ArrowBackIcon />, false)
                  : item("back", "/deployments", "Back", <ArrowBackIcon />, false)}
                <Divider sx={{ my: 1 }} />
                {userSections().map((section) =>
                  item(
                    section.key,
                    `/users/${userDetail.id}/${section.key}`,
                    section.label,
                    USER_SECTION_ICONS[section.key] ?? <InfoOutlinedIcon />,
                    userDetail.section === section.key,
                  ),
                )}
              </>
            ) : detail ? (
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
              GLOBAL_NAV.filter((nav) => !nav.adminOnly || canAdmin).map((nav) =>
                item(nav.to, nav.to, nav.label, nav.icon, location.pathname.startsWith(nav.to)),
              )
            )}
          </List>
        </SlideFade>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        {/* Fade the page content in on each navigation (keyed on the route). */}
        <Fade in appear key={location.pathname}>
          <Box sx={{ p: 4 }}>
            {/* Keyed on the path so navigating away from a crashed page remounts a fresh boundary. */}
            <ErrorBoundary key={location.pathname}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </Box>
        </Fade>
      </Box>
    </Box>
  );
}
