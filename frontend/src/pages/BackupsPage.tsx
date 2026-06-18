import { Alert, Stack, Typography } from "@mui/material";
import { BackupDestinations } from "../components/BackupDestinations";

export function BackupsPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        Backups
      </Typography>

      <Alert severity="info">
        Offsite destinations are shared across deployments. Create, schedule, restore, and push a
        deployment's backups from its <strong>Backups</strong> tab.
      </Alert>

      <BackupDestinations />
    </Stack>
  );
}
