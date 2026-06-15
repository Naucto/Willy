import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  MenuItem,
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
import { DomainsManager } from "./DomainsManager";

const STRATEGIES: BuildStrategy[] = ["DOCKERFILE", "NIXPACKS", "COMPOSE", "IMAGE"];

interface FormValues {
  gitUrl: string;
  gitRef: string;
  imageRef: string;
  buildStrategy: BuildStrategy;
  dockerfilePath: string;
  composeFilePath: string;
  composeWebService: string;
  webServicePort: string;
  healthCheckPath: string;
  runCommand: string;
  cronExpr: string;
  autoDeploy: boolean;
}

function trimmed(value: string): string | undefined {
  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function initialValues(deployment: Deployment): FormValues {
  return {
    gitUrl: deployment.gitUrl,
    gitRef: deployment.gitRef,
    imageRef: deployment.strategyConfig.imageRef ?? "",
    buildStrategy: deployment.buildStrategy,
    dockerfilePath: deployment.strategyConfig.dockerfilePath ?? "",
    composeFilePath: deployment.strategyConfig.composeFilePath ?? "",
    composeWebService: deployment.strategyConfig.composeWebService ?? "",
    webServicePort: deployment.webServicePort?.toString() ?? "",
    healthCheckPath: deployment.healthCheckPath,
    runCommand: deployment.runCommand ?? "",
    cronExpr: deployment.cronExpr ?? "",
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
    set("webServicePort", values.webServicePort ? Number(values.webServicePort) : undefined);

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

      <Alert severity="info">
        Resource limits (memory, CPU, capabilities, restart, logs) moved to the <b>Resources</b>{" "}
        tab.
      </Alert>

      {deployment.type === "WEB" && <DomainsManager deployment={deployment} />}

      <WebhookCard deploymentId={deployment.id} autoDeploy={deployment.autoDeploy} />
    </Stack>
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
