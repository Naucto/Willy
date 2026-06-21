import { Box, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useUpdateDeployment } from "../api/hooks";
import type { Deployment, UpdateDeploymentInput } from "../api/types";
import { useAction } from "../useAction";
import { OperateButton } from "./OperateButton";
import { SettingRow } from "./SettingRow";
import { SOURCE_OPTIONS, SourceFields } from "./source/SourceFields";
import type { SourceValue } from "./source/sourceTypes";

interface FormValues {
  source: SourceValue;
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
    },
    runCommand: deployment.runCommand ?? "",
    cronExpr: deployment.cronExpr ?? "",
  };
}

export function SettingsTab({ deployment }: { deployment: Deployment }) {
  const run = useAction();
  const update = useUpdateDeployment(deployment.id);
  const [values, setValues] = useState<FormValues>(() => initialValues(deployment));

  const { source } = values;
  const patchSource = (patch: Partial<SourceValue>): void =>
    setValues((current) => ({ ...current, source: { ...current.source, ...patch } }));

  const onSubmit = async () => {
    const payload: UpdateDeploymentInput = {
      buildStrategy: source.buildStrategy,
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
    set("runCommand", trimmed(values.runCommand));
    set("cronExpr", trimmed(values.cronExpr));

    await run(() => update.mutateAsync(payload), "Settings saved");
  };

  return (
    <Stack spacing={0} sx={{ maxWidth: 760 }}>
      <SettingRow
        label="Source"
        description="Where the container image comes from — a Dockerfile, a Compose file, or a pre-built registry image."
      >
        <TextField
          select
          label="Source type"
          value={source.buildStrategy}
          onChange={(event) =>
            patchSource({ buildStrategy: event.target.value as SourceValue["buildStrategy"] })
          }
          slotProps={{
            select: {
              renderValue: (v) => SOURCE_OPTIONS.find((o) => o.value === v)?.label ?? (v as string),
            },
          }}
        >
          {SOURCE_OPTIONS.map((opt) => (
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
        <SourceFields value={source} onChange={patchSource} />
      </SettingRow>

      {(deployment.type === "WORKER" || deployment.type === "CRON") && (
        <>
          <Divider />
          <SettingRow
            label="Run command"
            description="The command executed inside the container. Overrides the image's default CMD."
          >
            <TextField
              label="Run command"
              value={values.runCommand}
              onChange={(event) => setValues((c) => ({ ...c, runCommand: event.target.value }))}
            />
          </SettingRow>
        </>
      )}

      {deployment.type === "CRON" && (
        <>
          <Divider />
          <SettingRow
            label="Cron schedule"
            description="Standard 5-field cron expression (minute hour day month weekday, UTC)."
          >
            <TextField
              label="Cron expression"
              value={values.cronExpr}
              onChange={(event) => setValues((c) => ({ ...c, cronExpr: event.target.value }))}
            />
          </SettingRow>
        </>
      )}

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <OperateButton
          variant="contained"
          disabled={update.isPending}
          onClick={() => void onSubmit()}
        >
          Save changes
        </OperateButton>
      </Box>
    </Stack>
  );
}
