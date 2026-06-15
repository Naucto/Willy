import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Slider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useServiceResources, useUpdateDeployment, useUpdateServiceResources } from "../api/hooks";
import type { Container, Deployment, ResourceLimits } from "../api/types";
import { describeError } from "../errors";

const RESTART = ["UNLESS_STOPPED", "ALWAYS", "ON_FAILURE", "NO"] as const;

const MEMORY_MARKS = [
  { value: 0, label: "Off" },
  { value: 1024, label: "1G" },
  { value: 2048, label: "2G" },
  { value: 4096, label: "4G" },
];

const CPU_MARKS = [
  { value: 0, label: "Off" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
];

const COMMON_CAPS = [
  "ALL",
  "CHOWN",
  "DAC_OVERRIDE",
  "FOWNER",
  "SETUID",
  "SETGID",
  "KILL",
  "NET_ADMIN",
  "NET_RAW",
  "NET_BIND_SERVICE",
  "SYS_TIME",
  "SYS_ADMIN",
  "SYS_PTRACE",
];

function parseCaps(value: string): string[] {
  return value
    .split(",")
    .map((cap) => cap.trim().toUpperCase())
    .filter(Boolean);
}

// Resources are container-scoped: for compose, the selected container's service is tuned per service
// (stored in serviceResources, injected into the override); for single-container deployments the
// limits live on the deployment itself.
export function ResourcesTab({
  deployment,
  container,
}: {
  deployment: Deployment;
  container?: Container | undefined;
}) {
  if (deployment.buildStrategy === "COMPOSE") {
    const service = container?.service ?? null;

    if (!service) {
      return (
        <Alert severity="info">
          Select a running container above to tune its resources. Each compose service is limited
          independently.
        </Alert>
      );
    }

    return <ComposeServiceResources key={service} deploymentId={deployment.id} service={service} />;
  }

  return <DeploymentResources deployment={deployment} />;
}

function ComposeServiceResources({
  deploymentId,
  service,
}: {
  deploymentId: string;
  service: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading } = useServiceResources(deploymentId, service);
  const update = useUpdateServiceResources(deploymentId);

  if (isLoading || !data) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const onSave = async (limits: ResourceLimits) => {
    try {
      await update.mutateAsync({ service, body: limits });
      enqueueSnackbar(`Resources saved for ${service}`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <ResourceCard
      title={`Service: ${service}`}
      initial={data}
      saving={update.isPending}
      onSave={onSave}
    />
  );
}

function DeploymentResources({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateDeployment(deployment.id);

  const initial: ResourceLimits = {
    memoryLimitMb: deployment.memoryLimitMb,
    nanoCpus: deployment.nanoCpus,
    capAdd: deployment.capAdd ?? [],
    capDrop: deployment.capDrop ?? [],
    restartPolicy: deployment.restartPolicy,
    logMaxSizeMb: deployment.logMaxSizeMb,
    logMaxFiles: deployment.logMaxFiles,
  };

  const onSave = async (limits: ResourceLimits) => {
    try {
      await update.mutateAsync({
        memoryLimitMb: limits.memoryLimitMb ?? null,
        nanoCpus: limits.nanoCpus ?? null,
        capAdd: limits.capAdd ?? [],
        capDrop: limits.capDrop ?? [],
        restartPolicy: limits.restartPolicy ?? "UNLESS_STOPPED",
        logMaxSizeMb: limits.logMaxSizeMb ?? null,
        logMaxFiles: limits.logMaxFiles ?? null,
      });
      enqueueSnackbar("Resources saved", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <ResourceCard title="Container" initial={initial} saving={update.isPending} onSave={onSave} />
  );
}

function ResourceCard({
  title,
  initial,
  saving,
  onSave,
}: {
  title: string;
  initial: ResourceLimits;
  saving: boolean;
  onSave: (limits: ResourceLimits) => Promise<void>;
}) {
  const [restartPolicy, setRestartPolicy] = useState<(typeof RESTART)[number]>(
    (initial.restartPolicy as (typeof RESTART)[number] | undefined) ?? "UNLESS_STOPPED",
  );
  const [memoryMb, setMemoryMb] = useState(initial.memoryLimitMb ?? 0);
  const [cpuCores, setCpuCores] = useState(initial.nanoCpus ? initial.nanoCpus / 1e9 : 0);
  const [capAdd, setCapAdd] = useState((initial.capAdd ?? []).join(", "));
  const [capDrop, setCapDrop] = useState((initial.capDrop ?? []).join(", "));
  const [logMaxSizeMb, setLogMaxSizeMb] = useState(initial.logMaxSizeMb?.toString() ?? "");
  const [logMaxFiles, setLogMaxFiles] = useState(initial.logMaxFiles?.toString() ?? "");

  const submit = () =>
    void onSave({
      memoryLimitMb: memoryMb > 0 ? memoryMb : null,
      nanoCpus: cpuCores > 0 ? Math.round(cpuCores * 1e9) : null,
      capAdd: parseCaps(capAdd),
      capDrop: parseCaps(capDrop),
      restartPolicy,
      logMaxSizeMb: logMaxSizeMb ? Number(logMaxSizeMb) : null,
      logMaxFiles: logMaxFiles ? Number(logMaxFiles) : null,
    });

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="overline" color="text.secondary">
              {title}
            </Typography>

            <TextField
              select
              label="Restart policy"
              value={restartPolicy}
              onChange={(event) => setRestartPolicy(event.target.value as (typeof RESTART)[number])}
            >
              {RESTART.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>

            <LimitSlider
              label="Memory limit"
              value={memoryMb}
              max={4096}
              step={64}
              marks={MEMORY_MARKS}
              format={(v) => (v === 0 ? "No limit" : `${v} MB`)}
              onChange={setMemoryMb}
            />

            <LimitSlider
              label="CPU limit"
              value={cpuCores}
              max={8}
              step={0.5}
              marks={CPU_MARKS}
              format={(v) => (v === 0 ? "No limit" : `${v} cores`)}
              onChange={setCpuCores}
            />

            <CapabilityPicker
              label="Add capabilities"
              helperText="Linux capabilities to add on top of Docker's defaults."
              value={capAdd}
              onChange={setCapAdd}
            />

            <CapabilityPicker
              label="Drop capabilities"
              helperText="Use ALL to start from none, then add only what's needed."
              value={capDrop}
              onChange={setCapDrop}
            />

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label="Log max size (MB)"
                type="number"
                placeholder="default"
                value={logMaxSizeMb}
                onChange={(event) => setLogMaxSizeMb(event.target.value)}
                fullWidth
              />
              <TextField
                label="Log max files"
                type="number"
                placeholder="default"
                value={logMaxFiles}
                onChange={(event) => setLogMaxFiles(event.target.value)}
                fullWidth
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" disabled={saving} onClick={submit}>
          Save changes
        </Button>
      </Box>

      <Alert severity="info">Resource changes apply on the next deploy or restart.</Alert>
    </Stack>
  );
}

function LimitSlider({
  label,
  value,
  max,
  step,
  marks,
  format,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  marks: { value: number; label: string }[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, pl: 2, pr: 3, pt: 1, pb: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" color="text.secondary">
          {format(value)}
        </Typography>
      </Box>
      <Slider
        value={value}
        min={0}
        max={max}
        step={step}
        marks={marks}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => format(v)}
        onChange={(_, v) => onChange(typeof v === "number" ? v : (v[0] ?? 0))}
        sx={{ mx: 1.5, "& .MuiSlider-markLabel": { fontSize: 11 } }}
      />
    </Box>
  );
}

function CapabilityPicker({
  label,
  helperText,
  value,
  onChange,
}: {
  label: string;
  helperText: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={COMMON_CAPS}
      value={parseCaps(value)}
      onChange={(_, val) => onChange(val.map((cap) => cap.toUpperCase()).join(", "))}
      renderInput={(params) => <TextField {...params} label={label} helperText={helperText} />}
    />
  );
}
