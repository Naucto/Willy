import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRotateWebhook, useUpdateDeployment, useWebhook } from "../api/hooks";
import type { BuildStrategy, Deployment, UpdateDeploymentInput } from "../api/types";
import { describeError } from "../errors";
import { DomainPicker } from "./DomainPicker";

const STRATEGIES: BuildStrategy[] = ["DOCKERFILE", "NIXPACKS", "COMPOSE", "IMAGE"];
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

interface FormValues {
  gitUrl: string;
  gitRef: string;
  imageRef: string;
  domain: string;
  buildStrategy: BuildStrategy;
  dockerfilePath: string;
  composeFilePath: string;
  composeWebService: string;
  webServicePort: string;
  healthCheckPath: string;
  runCommand: string;
  cronExpr: string;
  restartPolicy: (typeof RESTART)[number];
  memoryLimitMb: string;
  cpuCores: string;
  capAdd: string;
  capDrop: string;
  autoDeploy: boolean;
}

// Capabilities are entered as a comma list (e.g. "NET_ADMIN, SYS_TIME").
function parseCaps(value: string): string[] {
  return value
    .split(",")
    .map((cap) => cap.trim().toUpperCase())
    .filter(Boolean);
}

function trimmed(value: string): string | undefined {
  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function initialValues(deployment: Deployment): FormValues {
  return {
    gitUrl: deployment.gitUrl,
    gitRef: deployment.gitRef,
    imageRef: deployment.imageRef ?? "",
    domain: deployment.primaryDomain ?? "",
    buildStrategy: deployment.buildStrategy,
    dockerfilePath: deployment.dockerfilePath ?? "",
    composeFilePath: deployment.composeFilePath ?? "",
    composeWebService: deployment.composeWebService ?? "",
    webServicePort: deployment.webServicePort?.toString() ?? "",
    healthCheckPath: deployment.healthCheckPath,
    runCommand: deployment.runCommand ?? "",
    cronExpr: deployment.cronExpr ?? "",
    restartPolicy: deployment.restartPolicy,
    memoryLimitMb: deployment.memoryLimitMb?.toString() ?? "",
    cpuCores: deployment.nanoCpus ? (deployment.nanoCpus / 1e9).toString() : "",
    capAdd: (deployment.capAdd ?? []).join(", "),
    capDrop: (deployment.capDrop ?? []).join(", "),
    autoDeploy: deployment.autoDeploy,
  };
}

export function SettingsTab({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateDeployment(deployment.id);
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { isDirty },
  } = useForm<FormValues>({ defaultValues: initialValues(deployment) });
  const strategy = watch("buildStrategy");

  const onSubmit = handleSubmit(async (values) => {
    const payload: UpdateDeploymentInput = {
      buildStrategy: values.buildStrategy,
      healthCheckPath: values.healthCheckPath.trim() || "/",
      restartPolicy: values.restartPolicy,
      autoDeploy: values.autoDeploy,
    };

    const set = <K extends keyof UpdateDeploymentInput>(
      key: K,
      value: UpdateDeploymentInput[K] | undefined,
    ): void => {
      if (value !== undefined) {
        payload[key] = value;
      }
    };

    if (values.buildStrategy === "IMAGE") {
      set("imageRef", trimmed(values.imageRef));
    } else {
      set("gitUrl", trimmed(values.gitUrl));
      set("gitRef", trimmed(values.gitRef));
    }

    set("dockerfilePath", trimmed(values.dockerfilePath));
    set("composeFilePath", trimmed(values.composeFilePath));
    set("composeWebService", trimmed(values.composeWebService));
    set("runCommand", trimmed(values.runCommand));
    set("cronExpr", trimmed(values.cronExpr));
    set("domain", trimmed(values.domain));
    set("webServicePort", values.webServicePort ? Number(values.webServicePort) : undefined);
    set("memoryLimitMb", values.memoryLimitMb ? Number(values.memoryLimitMb) : undefined);
    set("nanoCpus", values.cpuCores ? Math.round(Number(values.cpuCores) * 1e9) : undefined);
    set("capAdd", parseCaps(values.capAdd));
    set("capDrop", parseCaps(values.capDrop));

    try {
      await update.mutateAsync(payload);
      enqueueSnackbar("Settings saved", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  });

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <form onSubmit={onSubmit}>
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="overline" color="text.secondary">
                  Source &amp; build
                </Typography>

                {strategy === "IMAGE" ? (
                  <TextField
                    label="Image reference"
                    placeholder="nginx:1.27"
                    {...register("imageRef")}
                  />
                ) : (
                  <>
                    <TextField label="Git URL" {...register("gitUrl")} />
                    <TextField label="Git ref" {...register("gitRef")} />
                  </>
                )}

                {deployment.type === "WEB" && (
                  <Controller
                    name="domain"
                    control={control}
                    render={({ field }) => (
                      <DomainPicker value={field.value} onChange={field.onChange} />
                    )}
                  />
                )}

                <Controller
                  name="buildStrategy"
                  control={control}
                  render={({ field }) => (
                    <TextField select label="Build strategy" {...field}>
                      {STRATEGIES.map((value) => (
                        <MenuItem key={value} value={value}>
                          {value}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />

                {strategy === "DOCKERFILE" && (
                  <TextField label="Dockerfile path" {...register("dockerfilePath")} />
                )}

                {strategy === "COMPOSE" && (
                  <>
                    <TextField label="Compose file path" {...register("composeFilePath")} />
                    <TextField
                      label="Compose web service"
                      helperText="The service Willy routes and health-checks."
                      {...register("composeWebService")}
                    />
                  </>
                )}

                {deployment.type === "WEB" && (
                  <>
                    <TextField label="Service port" type="number" {...register("webServicePort")} />
                    {strategy !== "COMPOSE" && (
                      <TextField label="Health check path" {...register("healthCheckPath")} />
                    )}
                  </>
                )}

                {(deployment.type === "WORKER" || deployment.type === "CRON") && (
                  <TextField label="Run command" {...register("runCommand")} />
                )}

                {deployment.type === "CRON" && (
                  <TextField label="Cron expression" {...register("cronExpr")} />
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="overline" color="text.secondary">
                  Runtime
                </Typography>

                <Controller
                  name="restartPolicy"
                  control={control}
                  render={({ field }) => (
                    <TextField select label="Restart policy" {...field}>
                      {RESTART.map((value) => (
                        <MenuItem key={value} value={value}>
                          {value}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />

                <Controller
                  name="memoryLimitMb"
                  control={control}
                  render={({ field }) => (
                    <LimitSlider
                      label="Memory limit"
                      value={field.value ? Number(field.value) : 0}
                      max={4096}
                      step={64}
                      marks={MEMORY_MARKS}
                      format={(v) => (v === 0 ? "No limit" : `${v} MB`)}
                      onChange={(v) => field.onChange(v === 0 ? "" : String(v))}
                    />
                  )}
                />

                <Controller
                  name="cpuCores"
                  control={control}
                  render={({ field }) => (
                    <LimitSlider
                      label="CPU limit"
                      value={field.value ? Number(field.value) : 0}
                      max={8}
                      step={0.5}
                      marks={CPU_MARKS}
                      format={(v) => (v === 0 ? "No limit" : `${v} cores`)}
                      onChange={(v) => field.onChange(v === 0 ? "" : String(v))}
                    />
                  )}
                />

                <Controller
                  name="capAdd"
                  control={control}
                  render={({ field }) => (
                    <CapabilityPicker
                      label="Add capabilities"
                      helperText="Linux capabilities to add on top of Docker's defaults."
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />

                <Controller
                  name="capDrop"
                  control={control}
                  render={({ field }) => (
                    <CapabilityPicker
                      label="Drop capabilities"
                      helperText="Use ALL to start from none, then add only what's needed."
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />

                <Controller
                  name="autoDeploy"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={field.value} onChange={field.onChange} />}
                      label="Auto-deploy on webhook push"
                    />
                  )}
                />
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="contained" disabled={update.isPending || !isDirty}>
              Save changes
            </Button>
          </Box>
        </Stack>
      </form>

      <WebhookCard deploymentId={deployment.id} autoDeploy={deployment.autoDeploy} />
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
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, px: 2, pt: 1, pb: 0.5 }}>
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

function WebhookCard({ deploymentId, autoDeploy }: { deploymentId: string; autoDeploy: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data } = useWebhook(deploymentId);
  const rotate = useRotateWebhook(deploymentId);
  const [secret, setSecret] = useState<string | null>(null);

  const url = data ? `${window.location.origin}${data.path}` : "";

  const onRotate = async () => {
    try {
      const result = await rotate.mutateAsync();
      setSecret(result.secret);
      enqueueSnackbar("Webhook secret generated", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            GitHub webhook
          </Typography>

          {!autoDeploy && (
            <Alert severity="info">
              Auto-deploy is off — pushes won't deploy until you enable it above.
            </Alert>
          )}

          <TextField
            label="Payload URL"
            value={url}
            slotProps={{ input: { readOnly: true } }}
            helperText="Content type: application/json. Configure this URL in the repo's webhooks."
          />

          {secret && (
            <Alert severity="warning" onClose={() => setSecret(null)}>
              Copy this secret into the GitHub webhook now — it won't be shown again:
              <Box sx={{ fontFamily: "monospace", mt: 1, wordBreak: "break-all" }}>{secret}</Box>
            </Alert>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {data?.configured ? "Secret configured" : "No secret set"}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="outlined" onClick={() => void onRotate()} disabled={rotate.isPending}>
              {data?.configured ? "Rotate secret" : "Generate secret"}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
