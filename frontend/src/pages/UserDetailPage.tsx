import { Alert, Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useUser } from "../api/hooks";
import { UserGeneralTab } from "../components/UserGeneralTab";
import { UserSecurityTab } from "../components/UserSecurityTab";
import { UserTwoFactorTab } from "../components/UserTwoFactorTab";
import { describeError } from "../errors";
import { displayName, humanizeRole } from "../format";

export function UserDetailPage() {
  const { id = "", section } = useParams();
  const { data: user, isLoading, error } = useUser(id);

  // The active section is driven by the URL; the left sidebar (AppShell) navigates between sections.
  const active = section ?? "general";

  if (isLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !user) {
    return <Alert severity="error">{error ? describeError(error) : "User not found"}</Alert>;
  }

  const named = Boolean(user.name?.trim());

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", minWidth: 0 }}>
        <Typography variant="h4" noWrap sx={{ fontWeight: 700, minWidth: 0 }}>
          {displayName(user)}
        </Typography>
        <Chip size="small" label={humanizeRole(user.role)} variant="outlined" />
        {named && (
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        )}
      </Box>

      {active === "general" && <UserGeneralTab user={user} />}
      {active === "security" && <UserSecurityTab user={user} />}
      {active === "twofa" && <UserTwoFactorTab user={user} />}
    </Stack>
  );
}
