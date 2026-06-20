import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { Box, Button, Divider, Popover, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { displayName, humanizeRole } from "../format";

// The signed-in account: a text button (next to the activity bell, mirroring the Sign out button)
// showing the user's name — or email when unnamed — that opens a popover with the full identity.
export function AccountMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!user) {
    return null;
  }

  const named = Boolean(user.name?.trim());

  return (
    <>
      <Button
        color="inherit"
        startIcon={<AccountCircleOutlinedIcon />}
        sx={{ ml: 1 }}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {displayName(user)}
      </Button>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 280 } } }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2">Account</Typography>
        </Box>

        <Stack spacing={0.25} sx={{ px: 2, py: 1.5 }}>
          {named && <Typography variant="body2">{user.name}</Typography>}
          <Typography
            variant={named ? "caption" : "body2"}
            sx={{ wordBreak: "break-all", color: named ? "text.secondary" : undefined }}
          >
            {user.email}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {humanizeRole(user.role)}
          </Typography>
        </Stack>

        <Divider />

        <Box sx={{ p: 1 }}>
          <Button
            fullWidth
            sx={{ justifyContent: "flex-start" }}
            onClick={() => {
              setAnchor(null);
              navigate(`/users/${user.userId}/general`);
            }}
          >
            Account settings
          </Button>
        </Box>
      </Popover>
    </>
  );
}
