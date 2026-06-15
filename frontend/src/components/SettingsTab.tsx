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
import { useState } from "react";
import { useUpdateDeployment } from "../api/hooks";
import type { Deployment, UpdateDeploymentInput } from "../api/types";
import { describeError } from "../errors";
import { SOURCE_OPTIONS, SourceFields, sourceDescription } from "./source/SourceFields";
import type { SourceValue } from "./source/sourceTypes";

interface FormValues {
  source: SourceValue;
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
    source: {
      buildStrategy: deployment.buildStrategy,
      gitUrl: deployment.gitUrl,
      gitRef: deployment.gitRef,
      gitToken: "",
      imageRef: deployment.strategyConfig.imageRef ?? "",
      dockerfilePath: deployment.strategyConfig.dockerfilePath ?? "",
      composeFilePath: deployment.strategyConfig.composeFilePath ?? "",
      composeWebService: deployment.strategyConfig.composeWebService ?? "",
    },
    webServicePort: deployment.webServicePort?.toString() ?? "",
    healthCheckPath: deployment.healthCheckPath,
    runCommand: deployment.runCommand ?? "",
    cronExpr: deployment.cronExpr ?? "",
  };
}

export function SettingsTab({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateDeployment(deployment.id);
  const [values, setValues] = useState<FormValues>(() => initialValues(deployment));

  const { source } = values;
  const patchSource = (patch: Partial<SourceValue>): void =>
    setValues((current) => ({ ...current, source: { ...current.source, ...patch } }));

  const onSubmit = async () => {
    const payload: UpdateDeploymentInput = {
      buildStrategy: source.buildStrategy,
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

    if (source.buildStrategy === "IMAGE") {
      set("imageRef", trimmed(source.imageRef));
    } else {
      set("gitUrl", trimmed(source.gitUrl));
      set("gitRef", trimmed(source.gitRef));
    }

    set("dockerfilePath", trimmed(source.dockerfilePath));
    set("composeFilePath", trimmed(source.composeFilePath));
    set("composeWebService", trimmed(source.composeWebService));
    set("runCommand", trimmed(values.runCommand));
    set("cronExpr", trimmed(values.cronExpr));
    set("webServicePort", values.webServicePort ? Number(values.webServicePort) : undefined);

    try {
      await update.mutateAsync(payload);
      enqueueSnackbar("Settings saved", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="overline" color="text.secondary">
              Source &amp; build
            </Typography>

            <TextField
              select
              label="Source type"
              value={source.buildStrategy}
              helperText={sourceDescription(source.buildStrategy)}
              onChange={(event) =>
                patchSource({ buildStrategy: event.target.value as SourceValue["buildStrategy"] })
              }
            >
              {SOURCE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            <SourceFields value={source} onChange={patchSource} />

            {deployment.type === "WEB" && (
              <>
                <TextField
                  label="Service port"
                  type="number"
                  value={values.webServicePort}
                  onChange={(event) =>
                    setValues((c) => ({ ...c, webServicePort: event.target.value }))
                  }
                />
                {source.buildStrategy !== "COMPOSE" && (
                  <TextField
                    label="Health check path"
                    value={values.healthCheckPath}
                    onChange={(event) =>
                      setValues((c) => ({ ...c, healthCheckPath: event.target.value }))
                    }
                  />
                )}
              </>
            )}

            {(deployment.type === "WORKER" || deployment.type === "CRON") && (
              <TextField
                label="Run command"
                value={values.runCommand}
                onChange={(event) => setValues((c) => ({ ...c, runCommand: event.target.value }))}
              />
            )}

            {deployment.type === "CRON" && (
              <TextField
                label="Cron expression"
                value={values.cronExpr}
                onChange={(event) => setValues((c) => ({ ...c, cronExpr: event.target.value }))}
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" disabled={update.isPending} onClick={() => void onSubmit()}>
          Save changes
        </Button>
      </Box>
    </Stack>
  );
}
