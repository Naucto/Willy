import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useDeleteEnvVar, useEnvVars, useSetEnvVar } from "../api/hooks";
import type { Deployment, EnvScope, MaskedEnvVar } from "../api/types";
import { describeError } from "../errors";

const SCOPES: EnvScope[] = ["RUNTIME", "BUILD", "BOTH"];

// `service` is the focused compose service ("" = shared/everyone, or the single container) — driven
// by the deployment bar's container selector.
export function EnvVarEditor({
  deployment,
  service = "",
}: {
  deployment: Deployment;
  service?: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const deploymentId = deployment.id;

  const { data, isLoading, error } = useEnvVars(deploymentId, service);
  const deleteEnvVar = useDeleteEnvVar(deploymentId, service);

  const [adding, setAdding] = useState(false);

  const remove = async (envKey: string) => {
    try {
      await deleteEnvVar.mutateAsync(envKey);
      enqueueSnackbar(`Removed ${envKey}`, { variant: "success" });
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  const columns: GridColDef<MaskedEnvVar>[] = [
    { field: "key", headerName: "Key", flex: 1, minWidth: 200, cellClassName: "willy-mono" },
    { field: "scope", headerName: "Scope", width: 120 },
    {
      field: "isSecret",
      headerName: "Secret",
      width: 110,
      renderCell: (params) => (params.row.isSecret ? <Chip label="secret" size="small" /> : "—"),
    },
    {
      field: "actions",
      headerName: "",
      width: 70,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <IconButton size="small" onClick={() => void remove(params.row.key)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{describeError(error)}</Alert>}

      <Box sx={{ display: "flex" }}>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          Add variable
        </Button>
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
        Values are encrypted at rest and never shown again. Re-save a key to change its value.
      </Box>

      <AddEnvVarDialog
        open={adding}
        deploymentId={deploymentId}
        service={service}
        onClose={() => setAdding(false)}
      />
    </Stack>
  );
}

function AddEnvVarDialog({
  open,
  deploymentId,
  service,
  onClose,
}: {
  open: boolean;
  deploymentId: string;
  service: string;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const setEnvVar = useSetEnvVar(deploymentId, service);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<EnvScope>("RUNTIME");
  const [isSecret, setIsSecret] = useState(true);

  const reset = () => {
    setKey("");
    setValue("");
    setScope("RUNTIME");
    setIsSecret(true);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!key.trim()) {
      enqueueSnackbar("A key is required", { variant: "warning" });

      return;
    }

    try {
      await setEnvVar.mutateAsync({ key: key.trim(), body: { value, scope, isSecret } });
      enqueueSnackbar(`Saved ${key.trim()}`, { variant: "success" });
      close();
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Add environment variable</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Key" value={key} onChange={(event) => setKey(event.target.value)} />
          <TextField
            label="Value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type={isSecret ? "password" : "text"}
          />
          <TextField
            select
            label="Scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as EnvScope)}
          >
            {SCOPES.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch checked={isSecret} onChange={(event) => setIsSecret(event.target.checked)} />
            }
            label="Secret"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={setEnvVar.isPending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
