import { Alert, Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { useUser } from "../api/hooks";
import { UserGeneralTab } from "../components/UserGeneralTab";
import { UserSecurityTab } from "../components/UserSecurityTab";
import { UserTwoFactorTab } from "../components/UserTwoFactorTab";
import { describeError } from "../errors";
import { displayName, humanizeRole } from "../format";
import { userSections } from "../userSections";

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
  // The heading names the section being viewed; who it belongs to drops to a subtitle so an admin
  // editing another user still sees the identity.
  const sectionLabel = userSections().find((s) => s.key === active)?.label ?? "General";
  const subtitle = named ? `${displayName(user)} · ${user.email}` : user.email;

  return (
    <Stack spacing={3}>
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", minWidth: 0 }}
        >
          <Typography variant="h4" noWrap sx={{ fontWeight: 700, minWidth: 0 }}>
            {sectionLabel}
          </Typography>
          <Chip size="small" label={humanizeRole(user.role)} variant="outlined" />
        </Box>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      </Box>

      {active === "general" && <UserGeneralTab user={user} />}
      {active === "security" && <UserSecurityTab user={user} />}
      {active === "twofa" && <UserTwoFactorTab user={user} />}
    </Stack>
  );
}
