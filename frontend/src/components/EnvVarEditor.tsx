import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Box,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useDeleteEnvVar, useEnvVars, useSetEnvVar, useUpdateEnvVarMeta } from "../api/hooks";
import type { Deployment, EnvScope, MaskedEnvVar } from "../api/types";
import { describeError } from "../errors";
import { useAction } from "../useAction";
import { BaseDialog } from "./BaseDialog";
import { envSaveBlocked, envSaveMode, envValueDisplay } from "./envVarEditing";
import { OperateButton, OperateIconButton } from "./OperateButton";
import { PasswordField } from "./PasswordField";

const SCOPE_OPTIONS: { value: EnvScope; label: string; description: string }[] = [
  {
    value: "RUNTIME",
    label: "Runtime",
    description: "Available at runtime only, not injected into the build.",
  },
  {
    value: "BUILD",
    label: "Build",
    description: "Injected during the build step only, not at runtime.",
  },
  {
    value: "BOTH",
    label: "Build & runtime",
    description: "Available in both the build and runtime environments.",
  },
];

// `service` is the focused compose service ("" = shared/everyone, or the single container) — driven
// by the deployment bar's container selector.
export function EnvVarEditor({
  deployment,
  service = "",
}: {
  deployment: Deployment;
  service?: string;
}) {
  const run = useAction();
  const deploymentId = deployment.id;

  const { data, isLoading, error } = useEnvVars(deploymentId, service);
  const deleteEnvVar = useDeleteEnvVar(deploymentId, service);

  const [editing, setEditing] = useState<MaskedEnvVar | null>(null);
  const [adding, setAdding] = useState(false);

  const remove = (envKey: string) =>
    run(() => deleteEnvVar.mutateAsync(envKey), `Removed ${envKey}`);

  const columns: GridColDef<MaskedEnvVar>[] = [
    { field: "key", headerName: "Key", flex: 1, minWidth: 180, cellClassName: "willy-mono" },
    { field: "scope", headerName: "Scope", width: 120 },
    {
      field: "value",
      headerName: "Value",
      flex: 1,
      minWidth: 180,
      sortable: false,
      cellClassName: "willy-mono",
      renderCell: (params) =>
        params.row.isSecret ? (
          <Typography variant="body2" sx={{ color: "text.disabled" }}>
            —
          </Typography>
        ) : (
          envValueDisplay(params.row)
        ),
    },
    {
      field: "actions",
      headerName: "",
      width: 96,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <Box>
          <Tooltip title="Edit">
            <OperateIconButton size="small" onClick={() => setEditing(params.row)}>
              <EditIcon fontSize="small" />
            </OperateIconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <OperateIconButton size="small" onClick={() => void remove(params.row.key)}>
              <DeleteIcon fontSize="small" />
            </OperateIconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{describeError(error)}</Alert>}

      <Box sx={{ display: "flex" }}>
        <Box sx={{ flexGrow: 1 }} />
        <OperateButton variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          Add variable
        </OperateButton>
      </Box>

      <Box sx={{ height: 420 }}>
        <DataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.key}
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          localeText={{ noRowsLabel: "No environment variables set." }}
          sx={{ border: 0, "& .willy-mono": { fontFamily: "monospace" } }}
        />
      </Box>

      <Box sx={{ fontSize: 12, color: "text.secondary" }}>
        Regular values are shown and editable. Secret values are encrypted and never shown — enter a
        new value to change one.
      </Box>

      {(adding || editing !== null) && (
        // Keyed so switching between Add / editing a specific var remounts with fresh form state.
        <EnvVarDialog
          key={editing?.key ?? "__add__"}
          deploymentId={deploymentId}
          service={service}
          existing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Stack>
  );
}

function EnvVarDialog({
  deploymentId,
  service,
  existing,
  onClose,
}: {
  deploymentId: string;
  service: string;
  existing: MaskedEnvVar | null;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const run = useAction();
  const setEnvVar = useSetEnvVar(deploymentId, service);
  const updateMeta = useUpdateEnvVarMeta(deploymentId, service);

  const editing = existing !== null;
  const existingIsSecret = existing?.isSecret ?? false;

  // Re-seed the form whenever the dialog target changes (keyed remount below handles this).
  const [key, setKey] = useState(existing?.key ?? "");
  const [value, setValue] = useState(existing && !existing.isSecret ? (existing.value ?? "") : "");
  const [scope, setScope] = useState<EnvScope>(existing?.scope ?? "RUNTIME");
  const [isSecret, setIsSecret] = useState(existing?.isSecret ?? true);

  const blocked = envSaveBlocked({ editing, existingIsSecret, nextIsSecret: isSecret, value });

  const save = async () => {
    if (!key.trim()) {
      enqueueSnackbar("A key is required", { variant: "warning" });

      return;
    }

    const saved = await run(() => {
      if (envSaveMode({ editing, existingIsSecret, value }) === "meta") {
        return updateMeta.mutateAsync({ key: key.trim(), body: { scope, isSecret } });
      }

      return setEnvVar.mutateAsync({ key: key.trim(), body: { value, scope, isSecret } });
    }, `Saved ${key.trim()}`);

    if (saved) {
      onClose();
    }
  };

  const valueHelper =
    editing && existingIsSecret
      ? blocked
        ? "Enter a new value to convert this secret to a regular variable."
        : "Leave blank to keep the current secret; enter a value to change it."
      : " ";

  return (
    <BaseDialog
      title={editing ? `Edit ${existing.key}` : "Add environment variable"}
      onClose={onClose}
      onConfirm={() => void save()}
      confirmDisabled={setEnvVar.isPending || updateMeta.isPending || blocked}
    >
      <TextField
        label="Key"
        value={key}
        disabled={editing}
        onChange={(event) => setKey(event.target.value)}
      />
      {isSecret ? (
        <PasswordField
          label="Value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          helperText={valueHelper}
        />
      ) : (
        <TextField
          label="Value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          helperText={valueHelper}
        />
      )}
      <TextField
        select
        label="Scope"
        value={scope}
        onChange={(event) => setScope(event.target.value as EnvScope)}
        slotProps={{
          select: {
            renderValue: (v) => SCOPE_OPTIONS.find((o) => o.value === v)?.label ?? (v as string),
          },
        }}
      >
        {SCOPE_OPTIONS.map((opt) => (
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
      <FormControlLabel
        control={
          <Switch checked={isSecret} onChange={(event) => setIsSecret(event.target.checked)} />
        }
        label="Secret"
      />
    </BaseDialog>
  );
}
