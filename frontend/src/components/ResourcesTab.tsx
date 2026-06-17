import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  useHostResources,
  useServiceResources,
  useUpdateDeployment,
  useUpdateServiceResources,
} from "../api/hooks";
import type { Container, Deployment, ResourceLimits } from "../api/types";
import { describeError } from "../errors";
import { cpuMarks, cpuMax, memoryMarks, memoryMaxMb } from "./resourceScale";
import { SettingRow } from "./SettingRow";

const RESTART_OPTIONS = [
  {
    value: "UNLESS_STOPPED",
    label: "Unless stopped",
    description: "Restart automatically unless explicitly stopped.",
  },
  {
    value: "ALWAYS",
    label: "Always",
    description: "Always restart, even after a clean exit.",
  },
  {
    value: "ON_FAILURE",
    label: "On failure",
    description: "Restart only when the container exits with a non-zero code.",
  },
  {
    value: "NO",
    label: "Never",
    description: "Never restart — let it stop and stay stopped.",
  },
] as const;

type RestartPolicy = (typeof RESTART_OPTIONS)[number]["value"];

// Log rotation sliders: 0 means "use the operator-wide default" (LOG_MAX_SIZE / LOG_MAX_FILES).
const LOG_SIZE_MARKS = [
  { value: 0, label: "Default" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 200, label: "200" },
];

const LOG_FILES_MARKS = [
  { value: 0, label: "Default" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
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

const CAP_DESCRIPTIONS: Record<string, string> = {
  ALL: "Grant all capabilities (use with extreme caution).",
  CHOWN: "Make arbitrary changes to file UIDs and GIDs.",
  DAC_OVERRIDE: "Bypass file read/write/execute permission checks.",
  FOWNER: "Bypass permission checks for file operations requiring file ownership.",
  SETUID: "Make arbitrary manipulations of process UIDs.",
  SETGID: "Make arbitrary manipulations of process GIDs.",
  KILL: "Bypass permission checks for sending signals.",
  NET_ADMIN: "Perform various network administration tasks (interfaces, routing, etc.).",
  NET_RAW: "Use raw and packet sockets.",
  NET_BIND_SERVICE: "Bind to ports below 1024 without running as root.",
  SYS_TIME: "Set system clock and real-time hardware clock.",
  SYS_ADMIN: "Wide-ranging system administration (mounts, namespaces, etc.).",
  SYS_PTRACE: "Trace and debug other processes.",
};

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
    <ResourceForm
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
    <ResourceForm title="Container" initial={initial} saving={update.isPending} onSave={onSave} />
  );
}

function ResourceForm({
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
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>(
    (initial.restartPolicy as RestartPolicy | undefined) ?? "UNLESS_STOPPED",
  );
  const [memoryMb, setMemoryMb] = useState(initial.memoryLimitMb ?? 0);
  const [cpuCores, setCpuCores] = useState(initial.nanoCpus ? initial.nanoCpus / 1e9 : 0);
  const [capAdd, setCapAdd] = useState((initial.capAdd ?? []).join(", "));
  const [capDrop, setCapDrop] = useState((initial.capDrop ?? []).join(", "));
  const [logMaxSizeMb, setLogMaxSizeMb] = useState(initial.logMaxSizeMb ?? 0);
  const [logMaxFiles, setLogMaxFiles] = useState(initial.logMaxFiles ?? 0);

  const { data: host } = useHostResources();
  const memMax = memoryMaxMb(host?.memoryMb);
  const cpuCeiling = cpuMax(host?.cpus);

  const submit = () =>
    void onSave({
      memoryLimitMb: memoryMb > 0 ? memoryMb : null,
      nanoCpus: cpuCores > 0 ? Math.round(cpuCores * 1e9) : null,
      capAdd: parseCaps(capAdd),
      capDrop: parseCaps(capDrop),
      restartPolicy,
      logMaxSizeMb: logMaxSizeMb > 0 ? logMaxSizeMb : null,
      logMaxFiles: logMaxFiles > 0 ? logMaxFiles : null,
    });

  return (
    <Stack spacing={0} sx={{ maxWidth: 760 }}>
      <Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
        {title}
      </Typography>

      <SettingRow
        label="Restart policy"
        description="How the container is restarted when it exits or the host daemon restarts."
      >
        <TextField
          select
          label="Restart policy"
          value={restartPolicy}
          onChange={(event) => setRestartPolicy(event.target.value as RestartPolicy)}
          slotProps={{
            select: {
              renderValue: (v) =>
                RESTART_OPTIONS.find((o) => o.value === v)?.label ?? (v as string),
            },
          }}
        >
          {RESTART_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              <Stack spacing={0.25}>
                <Typography variant="body2">{opt.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {opt.description}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
      </SettingRow>

      <Divider />

      <SettingRow
        label="Add capabilities"
        description="Linux capabilities to grant on top of Docker's defaults."
      >
        <CapabilityPicker value={capAdd} onChange={setCapAdd} />
      </SettingRow>

      <Divider />

      <SettingRow
        label="Drop capabilities"
        description="Linux capabilities to strip. Use ALL to start from none, then add only what's needed."
      >
        <CapabilityPicker value={capDrop} onChange={setCapDrop} />
      </SettingRow>

      <Divider sx={{ my: 1 }} />

      <SettingRow
        label="Memory limit"
        description="Hard cap on container memory. Unset means no limit (uses host memory freely)."
      >
        <LimitSlider
          value={memoryMb}
          max={memMax}
          step={64}
          marks={memoryMarks(memMax)}
          format={(v) => (v === 0 ? "No limit" : `${v} MB`)}
          onChange={setMemoryMb}
        />
      </SettingRow>

      <Divider />

      <SettingRow
        label="CPU limit"
        description="Hard cap on CPU usage in cores. Unset means no limit."
      >
        <LimitSlider
          value={cpuCores}
          max={cpuCeiling}
          step={0.5}
          marks={cpuMarks(cpuCeiling)}
          format={(v) => (v === 0 ? "No limit" : `${v} cores`)}
          onChange={setCpuCores}
        />
      </SettingRow>

      <Divider sx={{ my: 1 }} />

      <SettingRow
        label="Log rotation"
        description="Controls Docker's json-file log driver rotation. 0 uses the operator-wide default."
      >
        <LimitSlider
          value={logMaxSizeMb}
          max={200}
          step={5}
          marks={LOG_SIZE_MARKS}
          format={(v) => (v === 0 ? "Default" : `${v} MB`)}
          onChange={setLogMaxSizeMb}
        />
        <LimitSlider
          value={logMaxFiles}
          max={10}
          step={1}
          marks={LOG_FILES_MARKS}
          format={(v) => (v === 0 ? "Default" : `${v} files`)}
          onChange={setLogMaxFiles}
        />
      </SettingRow>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">
          Resource changes apply on the next deploy or restart.
        </Typography>
        <Button variant="contained" disabled={saving} onClick={submit}>
          Save changes
        </Button>
      </Box>
    </Stack>
  );
}

function LimitSlider({
  value,
  max,
  step,
  marks,
  format,
  onChange,
}: {
  value: number;
  max: number;
  step: number;
  marks: { value: number; label: string }[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Box
      sx={{ border: 1, borderColor: "divider", borderRadius: 1, pl: 2, pr: 4.5, pt: 1, pb: 0.5 }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", mb: 1 }}>
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
  value,
  onChange,
}: {
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
      renderValue={(tags, getItemProps) =>
        tags.map((tag, index) => {
          const { key, ...itemProps } = getItemProps({ index });

          return (
            <Tooltip key={key} title={CAP_DESCRIPTIONS[tag] ?? "Custom capability"}>
              <Chip {...itemProps} label={tag} size="small" />
            </Tooltip>
          );
        })
      }
      renderOption={(props, option) => (
        <li {...props} key={option}>
          <Stack spacing={0.25}>
            <Typography variant="body2">{option}</Typography>
            {CAP_DESCRIPTIONS[option] && (
              <Typography variant="caption" color="text.secondary">
                {CAP_DESCRIPTIONS[option]}
              </Typography>
            )}
          </Stack>
        </li>
      )}
      renderInput={(params) => <TextField {...params} />}
    />
  );
}
