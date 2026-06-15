import {
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { Controller, useForm } from "react-hook-form";
import { useUpdateDeployment } from "../api/hooks";
import type { BuildStrategy, Deployment, UpdateDeploymentInput } from "../api/types";
import { describeError } from "../errors";

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
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
          <Button type="submit" variant="contained" disabled={update.isPending || !isDirty}>
            Save changes
          </Button>
        </Box>
      </form>
    </Stack>
  );
}
