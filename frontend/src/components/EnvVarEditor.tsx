import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useDeleteEnvVar, useDeploymentContainers, useEnvVars, useSetEnvVar } from "../api/hooks";
import type { Deployment, EnvScope, MaskedEnvVar } from "../api/types";
import { describeError } from "../errors";

const SCOPES: EnvScope[] = ["RUNTIME", "BUILD", "BOTH"];

export function EnvVarEditor({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const deploymentId = deployment.id;
  const isCompose = deployment.buildStrategy === "COMPOSE";
  const { data: containers } = useDeploymentContainers(deploymentId);

  // Compose env is scoped per service ("" = shared across all services). Single-container apps just
  // use the shared scope.
  const [service, setService] = useState("");
  const serviceNames = Array.from(
    new Set(
      [
        deployment.strategyConfig.composeWebService ?? "",
        ...(containers ?? []).map((c) => c.service ?? ""),
      ].filter(Boolean),
    ),
  );

  const { data, isLoading, error } = useEnvVars(deploymentId, service);
  const setEnvVar = useSetEnvVar(deploymentId, service);
  const deleteEnvVar = useDeleteEnvVar(deploymentId, service);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<EnvScope>("RUNTIME");
  const [isSecret, setIsSecret] = useState(true);

  const add = async () => {
    if (!key.trim()) {
      enqueueSnackbar("A key is required", { variant: "warning" });

      return;
    }

    try {
      await setEnvVar.mutateAsync({ key: key.trim(), body: { value, scope, isSecret } });
      enqueueSnackbar(`Saved ${key.trim()}`, { variant: "success" });
      setKey("");
      setValue("");
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

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
    <Stack spacing={3}>
      {error && <Alert severity="error">{describeError(error)}</Alert>}

      {isCompose && (
        <TextField
          select
          label="Applies to"
          value={service}
          onChange={(event) => setService(event.target.value)}
          helperText="Shared vars apply to every service; a service's own vars override them."
          sx={{ maxWidth: 320 }}
        >
          <MenuItem value="">All services (shared)</MenuItem>
          {serviceNames.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { md: "center" } }}
        >
          <TextField
            label="Key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            sx={{ minWidth: 180 }}
          />
          <TextField
            label="Value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type={isSecret ? "password" : "text"}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            select
            label="Scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as EnvScope)}
            sx={{ minWidth: 120 }}
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
          <Button variant="contained" onClick={() => void add()} disabled={setEnvVar.isPending}>
            Save
          </Button>
        </Stack>
      </Paper>

      {!isLoading && data && data.length === 0 && (
        <Alert severity="info">No environment variables set.</Alert>
      )}

      {data && data.length > 0 && (
        <Box sx={{ height: 420 }}>
          <DataGrid
            rows={data}
            columns={columns}
            loading={isLoading}
            getRowId={(row) => row.key}
            density="compact"
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{ border: 0, "& .willy-mono": { fontFamily: "monospace" } }}
          />
        </Box>
      )}

      <Box sx={{ fontSize: 12, color: "text.secondary" }}>
        Values are encrypted at rest and never shown again. Re-save a key to change its value.
      </Box>
    </Stack>
  );
}
