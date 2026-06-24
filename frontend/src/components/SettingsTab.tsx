import {
  Box,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useRenameDeployment, useUpdateDeployment } from "../api/hooks";
import type { Deployment, UpdateDeploymentInput } from "../api/types";
import { useAction } from "../useAction";
import { ConfirmDialog } from "./ConfirmDialog";
import { CronEditor } from "./CronEditor";
import { OperateButton } from "./OperateButton";
import { PasswordField } from "./PasswordField";
import { SettingRow } from "./SettingRow";
import { isGitStrategy, SOURCE_OPTIONS, SourceFields } from "./source/SourceFields";
import type { SourceValue } from "./source/sourceTypes";

// Mirrors the backend create/rename constraint.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

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
  const rename = useRenameDeployment(deployment.id);
  const [values, setValues] = useState<FormValues>(() => initialValues(deployment));
  const [name, setName] = useState(deployment.name);

  // The token lives behind a toggle: off keeps the stored token untouched, on enables the field so a
  // new token can be typed (or cleared by saving it empty).
  const [editToken, setEditToken] = useState(false);
  const [tokenValue, setTokenValue] = useState("");

  // The name change shares the Save flow but warns first, since it feeds Docker resource identifiers.
  const [confirming, setConfirming] = useState(false);

  const { source } = values;
  const patchSource = (patch: Partial<SourceValue>): void =>
    setValues((current) => ({ ...current, source: { ...current.source, ...patch } }));

  const nameChanged = name !== deployment.name;
  const nameInvalid = !NAME_RE.test(name);

  // Renames first (if any), then applies the rest — one snackbar for the whole save.
  const save = async () => {
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

    // A non-empty value replaces the token; an empty value clears it. Only sent when the toggle is on.
    if (editToken && isGitStrategy(source.buildStrategy)) {
      payload.gitToken = tokenValue.trim();
    }

    const ok = await run(async () => {
      if (nameChanged) {
        await rename.mutateAsync(name);
      }

      await update.mutateAsync(payload);
    }, "Settings saved");

    if (ok) {
      setEditToken(false);
      setTokenValue("");
    }
  };

  const onSubmit = (): void => {
    if (nameChanged && nameInvalid) {
      return;
    }

    // A name change feeds container/image/route names, so confirm before saving.
    if (nameChanged) {
      setConfirming(true);

      return;
    }

    void save();
  };

  const saving = update.isPending || rename.isPending;

  return (
    <Stack spacing={0} sx={{ maxWidth: 760 }}>
      <SettingRow
        label="Name"
        description="The deployment's name, also used in container, image, and route names. A new name only takes effect on the next deploy."
      >
        <TextField
          label="Name"
          value={name}
          error={nameChanged && nameInvalid}
          helperText={
            nameChanged && nameInvalid
              ? "Lowercase letters, digits and hyphens; 1–41 chars."
              : "Renaming takes effect on the next deploy; resources from the old name remain until then."
          }
          onChange={(event) => setName(event.target.value)}
        />
      </SettingRow>

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

      {isGitStrategy(source.buildStrategy) && (
        <SettingRow
          label="Git token"
          description="Personal access token for cloning a private repository. Stored encrypted; never shown again."
        >
          <FormControlLabel
            control={
              <Switch
                checked={editToken}
                onChange={(event) => {
                  setEditToken(event.target.checked);
                  setTokenValue("");
                }}
              />
            }
            label={deployment.hasGitToken ? "Replace stored token" : "Set a token"}
          />
          <PasswordField
            label="Git token"
            value={tokenValue}
            disabled={!editToken}
            placeholder={deployment.hasGitToken ? "•••••••• (a token is stored)" : undefined}
            helperText={
              editToken
                ? "Leave empty and save to remove the stored token."
                : deployment.hasGitToken
                  ? "A token is stored. Toggle to replace or remove it."
                  : "No token stored."
            }
            onChange={(event) => setTokenValue(event.target.value)}
          />
        </SettingRow>
      )}

      {(deployment.type === "WORKER" || deployment.type === "CRON") && (
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
      )}

      {deployment.type === "CRON" && (
        <SettingRow
          label="Cron schedule"
          description="When the job runs (UTC). Pick a frequency or switch to Custom for a raw expression."
        >
          <CronEditor
            value={values.cronExpr}
            onChange={(value) => setValues((c) => ({ ...c, cronExpr: value }))}
          />
        </SettingRow>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <OperateButton
          variant="contained"
          disabled={saving || (nameChanged && nameInvalid)}
          onClick={onSubmit}
        >
          Save changes
        </OperateButton>
      </Box>

      <ConfirmDialog
        open={confirming}
        title="Rename deployment?"
        message={`Saving will rename "${deployment.name}" to "${name}". The name is used in container, image, and route names, so this only takes full effect on the next deploy — containers and images created under the old name stay until you redeploy.`}
        confirmLabel="Save changes"
        onConfirm={() => {
          setConfirming(false);
          void save();
        }}
        onCancel={() => setConfirming(false)}
      />
    </Stack>
  );
}
