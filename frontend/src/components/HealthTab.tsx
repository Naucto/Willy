import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useServiceResources, useUpdateDeployment, useUpdateServiceResources } from "../api/hooks";
import type { Container, DeclaredHealthcheck, Deployment, Healthcheck } from "../api/types";
import { describeError } from "../errors";
import { SettingRow } from "./SettingRow";

const RESTART_OPTIONS = [
  {
    value: "UNLESS_STOPPED",
    label: "Unless stopped",
    description: "Restart automatically unless explicitly stopped.",
  },
  { value: "ALWAYS", label: "Always", description: "Always restart, even after a clean exit." },
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

interface HealthValues {
  restartPolicy: RestartPolicy;
  healthcheck: Healthcheck | null;
  healthCheckPath: string;
}

// Health is container-scoped like Resources: for compose, the selected service's restart policy +
// custom healthcheck live per service (serviceResources); for single-container they live on the
// deployment. The readiness path (WEB) is always deployment-level. Declared healthchecks (from the
// image/compose file) are surfaced read-only.
export function HealthTab({
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
          Select a running container above to configure its health. Each compose service is
          health-checked independently.
        </Alert>
      );
    }

    return (
      <ComposeServiceHealth
        key={service}
        deployment={deployment}
        service={service}
        container={container}
      />
    );
  }

  return <DeploymentHealth deployment={deployment} container={container} />;
}

function DeploymentHealth({
  deployment,
  container,
}: {
  deployment: Deployment;
  container?: Container | undefined;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateDeployment(deployment.id);

  const onSave = async (values: HealthValues) => {
    try {
      await update.mutateAsync({
        restartPolicy: values.restartPolicy,
        healthcheck: values.healthcheck,
        ...(deployment.type === "WEB"
          ? { healthCheckPath: values.healthCheckPath.trim() || "/" }
          : {}),
      });
      enqueueSnackbar("Health settings saved", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <HealthForm
      title="Container"
      initial={{
        restartPolicy: (deployment.restartPolicy as RestartPolicy) ?? "UNLESS_STOPPED",
        healthcheck: deployment.healthcheck ?? null,
        healthCheckPath: deployment.healthCheckPath ?? "/",
      }}
      declared={container?.declaredHealthcheck ?? null}
      runtimeHealth={container?.health ?? null}
      showReadiness={deployment.type === "WEB"}
      saving={update.isPending}
      onSave={onSave}
    />
  );
}

function ComposeServiceHealth({
  deployment,
  service,
  container,
}: {
  deployment: Deployment;
  service: string;
  container?: Container | undefined;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading } = useServiceResources(deployment.id, service);
  const updateResources = useUpdateServiceResources(deployment.id);
  const updateDeployment = useUpdateDeployment(deployment.id);

  if (isLoading || !data) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const onSave = async (values: HealthValues) => {
    try {
      // Restart + healthcheck are per service; the readiness path is a single deployment-level
      // setting, so it's saved separately on the deployment.
      await updateResources.mutateAsync({
        service,
        body: { restartPolicy: values.restartPolicy, healthcheck: values.healthcheck },
      });

      if (deployment.type === "WEB") {
        await updateDeployment.mutateAsync({
          healthCheckPath: values.healthCheckPath.trim() || "/",
        });
      }

      enqueueSnackbar(`Health settings saved for ${service}`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <HealthForm
      title={`Service: ${service}`}
      initial={{
        restartPolicy: (data.restartPolicy as RestartPolicy) ?? "UNLESS_STOPPED",
        healthcheck: data.healthcheck ?? null,
        healthCheckPath: deployment.healthCheckPath ?? "/",
      }}
      declared={container?.declaredHealthcheck ?? null}
      runtimeHealth={container?.health ?? null}
      showReadiness={deployment.type === "WEB"}
      saving={updateResources.isPending || updateDeployment.isPending}
      onSave={onSave}
    />
  );
}

function HealthForm({
  title,
  initial,
  declared,
  runtimeHealth,
  showReadiness,
  saving,
  onSave,
}: {
  title: string;
  initial: HealthValues;
  declared: DeclaredHealthcheck | null;
  runtimeHealth: string | null;
  showReadiness: boolean;
  saving: boolean;
  onSave: (values: HealthValues) => Promise<void>;
}) {
  const [restartPolicy, setRestartPolicy] = useState<RestartPolicy>(initial.restartPolicy);
  const [healthCheckPath, setHealthCheckPath] = useState(initial.healthCheckPath);
  const [enabled, setEnabled] = useState(Boolean(initial.healthcheck));
  const [test, setTest] = useState(initial.healthcheck?.test ?? "");
  const [interval, setInterval] = useState(initial.healthcheck?.interval ?? "");
  const [timeout, setTimeout] = useState(initial.healthcheck?.timeout ?? "");
  const [retries, setRetries] = useState(
    initial.healthcheck?.retries ? String(initial.healthcheck.retries) : "",
  );

  const submit = () => {
    const healthcheck: Healthcheck | null =
      enabled && test.trim()
        ? {
            test: test.trim(),
            ...(interval.trim() ? { interval: interval.trim() } : {}),
            ...(timeout.trim() ? { timeout: timeout.trim() } : {}),
            ...(retries.trim() ? { retries: Number(retries) } : {}),
          }
        : null;

    void onSave({ restartPolicy, healthcheck, healthCheckPath });
  };

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

      {showReadiness && (
        <>
          <Divider />
          <SettingRow
            label="Readiness path"
            description="HTTP path Traefik polls to confirm the container is ready before routing traffic. Used when no Docker healthcheck is declared/defined."
          >
            <TextField
              label="Readiness path"
              value={healthCheckPath}
              onChange={(event) => setHealthCheckPath(event.target.value)}
            />
          </SettingRow>
        </>
      )}

      <Divider sx={{ my: 1 }} />

      <SettingRow
        label="Declared healthcheck"
        description="The healthcheck the image or compose file defines. Read-only — managed in your source, surfaced here for reference."
      >
        <DeclaredHealthcheckView declared={declared} runtimeHealth={runtimeHealth} />
      </SettingRow>

      <Divider />

      <SettingRow
        label="Custom healthcheck"
        description="A healthcheck Willy injects on top of the image's. Once healthy is required, the next deploy waits for it before cutting traffic over."
      >
        <FormControlLabel
          control={
            <Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          }
          label="Define a custom healthcheck"
        />

        {enabled && (
          <>
            <TextField
              label="Test command"
              placeholder="curl -f http://localhost/health"
              helperText="Shell command run inside the container (wrapped as CMD-SHELL); non-zero exit = unhealthy."
              value={test}
              onChange={(event) => setTest(event.target.value)}
            />
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Interval"
                placeholder="30s"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                sx={{ flex: 1, minWidth: 120 }}
              />
              <TextField
                label="Timeout"
                placeholder="10s"
                value={timeout}
                onChange={(event) => setTimeout(event.target.value)}
                sx={{ flex: 1, minWidth: 120 }}
              />
              <TextField
                label="Retries"
                type="number"
                placeholder="3"
                value={retries}
                onChange={(event) => setRetries(event.target.value)}
                sx={{ flex: 1, minWidth: 120 }}
              />
            </Box>
          </>
        )}
      </SettingRow>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, alignItems: "center" }}>
        <Typography variant="caption" color="text.secondary">
          Health changes apply on the next deploy or restart.
        </Typography>
        <Button variant="contained" disabled={saving} onClick={submit}>
          Save changes
        </Button>
      </Box>
    </Stack>
  );
}

function DeclaredHealthcheckView({
  declared,
  runtimeHealth,
}: {
  declared: DeclaredHealthcheck | null;
  runtimeHealth: string | null;
}) {
  if (!declared) {
    return (
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No healthcheck declared by the image or compose file.
        </Typography>
        {runtimeHealth ? <Chip label={runtimeHealth} size="small" variant="outlined" /> : null}
      </Box>
    );
  }

  const rows: [string, string][] = [["Test", declared.test.join(" ")]];

  if (declared.interval) {
    rows.push(["Interval", declared.interval]);
  }

  if (declared.timeout) {
    rows.push(["Timeout", declared.timeout]);
  }

  if (declared.retries !== null) {
    rows.push(["Retries", String(declared.retries)]);
  }

  if (declared.startPeriod) {
    rows.push(["Start period", declared.startPeriod]);
  }

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1.5,
        bgcolor: "action.hover",
        color: "text.secondary",
      }}
    >
      <Stack spacing={0.5}>
        {runtimeHealth ? (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
            <Typography variant="caption">Current status</Typography>
            <Chip label={runtimeHealth} size="small" variant="outlined" />
          </Box>
        ) : null}
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: "flex", gap: 2 }}>
            <Typography variant="caption" sx={{ width: 90, flexShrink: 0 }}>
              {label}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
