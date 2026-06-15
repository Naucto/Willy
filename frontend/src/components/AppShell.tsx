import BackupIcon from "@mui/icons-material/Backup";
import DnsIcon from "@mui/icons-material/Dns";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleIcon from "@mui/icons-material/People";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import {
  AppBar,
  Box,
  Button,
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
import { useAuth } from "../auth/AuthContext";

const DRAWER_WIDTH = 220;
const COLLAPSED_WIDTH = 64;

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: "Deployments", to: "/deployments", icon: <RocketLaunchIcon /> },
  { label: "DNS", to: "/dns", icon: <DnsIcon /> },
  { label: "Backups", to: "/backups", icon: <BackupIcon /> },
  { label: "Users", to: "/users", icon: <PeopleIcon />, adminOnly: true },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const nav = NAV.filter((item) => !item.adminOnly || user?.role === "ADMIN");

  const width = open ? DRAWER_WIDTH : COLLAPSED_WIDTH;

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

          <Typography
            variant="h6"
            component={RouterLink}
            to="/deployments"
            sx={{ color: "text.primary", textDecoration: "none", fontWeight: 700 }}
          >
            Willy 🐋
          </Typography>

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
          {nav.map((item) => (
            <Tooltip key={item.to} title={item.label} placement="right" disableHoverListener={open}>
              <ListItemButton
                component={RouterLink}
                to={item.to}
                selected={location.pathname.startsWith(item.to)}
                sx={{ minHeight: 48, justifyContent: open ? "initial" : "center", px: 2.5 }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: open ? 3 : 0, justifyContent: "center" }}>
                  {item.icon}
                </ListItemIcon>
                {open && <ListItemText primary={item.label} />}
              </ListItemButton>
            </Tooltip>
          ))}
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
