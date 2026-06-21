import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useAppSettings, useUpdateAppSettings } from "../api/hooks";
import { SettingRow } from "../components/SettingRow";
import { describeError } from "../errors";
import { useAction } from "../useAction";

export function SettingsPage() {
  const run = useAction();
  const { data: settings, isLoading, error } = useAppSettings();
  const updateSettings = useUpdateAppSettings();

  const onToggleShowAll = (showAllResources: boolean) =>
    run(() => updateSettings.mutateAsync({ showAllResources }));

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

          <PortBindingSetting settings={settings} />
        </Stack>
      )}
    </Stack>
  );
}

function PortBindingSetting({
  settings,
}: {
  settings: NonNullable<ReturnType<typeof useAppSettings>["data"]>;
}) {
  const run = useAction();
  const updateSettings = useUpdateAppSettings();
  const capacity = settings.portBindingCapacity;
  const { portBinding } = settings;

  // Local draft for the range fields so typing doesn't fire a request per keystroke; committed on blur.
  const [start, setStart] = useState(String(portBinding.start));
  const [end, setEnd] = useState(String(portBinding.end));

  const save = (patch: { enabled?: boolean; start?: number; end?: number }) =>
    run(() => updateSettings.mutateAsync({ portBinding: patch }));

  if (!capacity) {
    return (
      <SettingRow
        label="Hard-bound domain ports"
        description="Bind a domain to dedicated host ports (e.g. several servers behind one domain, each on its own port), routed through Traefik with TLS."
      >
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
          Not provisioned. Set <code>WILLY_PORT_BIND_RANGE</code> and redeploy to enable.
        </Typography>
      </SettingRow>
    );
  }

  const commit = (which: "start" | "end", raw: string) => {
    const value = Number.parseInt(raw, 10);

    if (!Number.isInteger(value)) {
      return;
    }

    void save(which === "start" ? { start: value } : { end: value });
  };

  return (
    <SettingRow
      label="Hard-bound domain ports"
      description={`Bind a domain to dedicated host ports, routed through Traefik with TLS. Allocatable range must stay within the provisioned capacity ${capacity.start}–${capacity.end} (widening it needs a redeploy).`}
    >
      <Stack spacing={1.5} sx={{ minWidth: 280 }}>
        <FormControlLabel
          control={
            <Switch
              checked={portBinding.enabled}
              disabled={updateSettings.isPending}
              onChange={(event) => void save({ enabled: event.target.checked })}
            />
          }
          label={portBinding.enabled ? "Enabled" : "Disabled"}
        />

        <Stack direction="row" spacing={1.5}>
          <TextField
            label="From"
            type="number"
            size="small"
            value={start}
            disabled={!portBinding.enabled || updateSettings.isPending}
            slotProps={{ htmlInput: { min: capacity.start, max: capacity.end } }}
            onChange={(event) => setStart(event.target.value)}
            onBlur={(event) => commit("start", event.target.value)}
          />
          <TextField
            label="To"
            type="number"
            size="small"
            value={end}
            disabled={!portBinding.enabled || updateSettings.isPending}
            slotProps={{ htmlInput: { min: capacity.start, max: capacity.end } }}
            onChange={(event) => setEnd(event.target.value)}
            onBlur={(event) => commit("end", event.target.value)}
          />
        </Stack>
      </Stack>
    </SettingRow>
  );
}
