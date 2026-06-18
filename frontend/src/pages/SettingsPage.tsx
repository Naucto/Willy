import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useAppSettings, useUpdateAppSettings } from "../api/hooks";
import { SettingRow } from "../components/SettingRow";
import { describeError } from "../errors";

export function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { data: settings, isLoading, error } = useAppSettings();
  const updateSettings = useUpdateAppSettings();

  const onToggleShowAll = async (showAllResources: boolean) => {
    try {
      await updateSettings.mutateAsync({ showAllResources });
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        Settings
      </Typography>

      {error && <Alert severity="error">{describeError(error)}</Alert>}

      {isLoading || !settings ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={0} sx={{ maxWidth: 760 }}>
          <SettingRow
            label="Show all host resources"
            description="Include system & unmanaged containers and images on the Images and Containers pages (for disk cleanup). Off shows only Willy-managed resources."
          >
            <FormControlLabel
              control={
                <Switch
                  checked={settings.showAllResources}
                  disabled={updateSettings.isPending}
                  onChange={(event) => void onToggleShowAll(event.target.checked)}
                />
              }
              label={settings.showAllResources ? "All resources" : "Managed only"}
            />
          </SettingRow>
        </Stack>
      )}
    </Stack>
  );
}
