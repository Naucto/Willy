import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  useAddDomain,
  useDeploymentContainers,
  useDeploymentDomains,
  useMakeDomainPrimary,
  useRemoveDomain,
  useUpdateDomainTarget,
} from "../api/hooks";
import type { Container, Deployment, DeploymentDomain } from "../api/types";
import { describeError } from "../errors";
import { DomainPicker } from "./DomainPicker";

// A valid FQDN: 2+ dot-separated labels, each 1-63 chars, no leading/trailing hyphen, ≤253 total.
// Allows *.localhost (local dev) and real domains; rejects single labels and obviously bad input.
const FQDN_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

function isValidFqdn(value: string): boolean {
  return FQDN_RE.test(value.trim());
}

interface ServiceOption {
  value: string;
  label: string;
}

// Live multi-domain editor. Each domain can be pinned to a specific container/service (compose
// only) and a specific port; blank falls back to the deployment default. Adding and editing a route
// both go through one modal; changes apply on the next deploy/restart.
export function DomainsManager({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: domains } = useDeploymentDomains(deployment.id);
  const { data: containers } = useDeploymentContainers(deployment.id);
  const makePrimary = useMakeDomainPrimary(deployment.id);
  const removeDomain = useRemoveDomain(deployment.id);

  const isCompose = deployment.buildStrategy === "COMPOSE";
  const defaultService = deployment.strategyConfig.composeWebService ?? "";
  const defaultPort = deployment.webServicePort ?? 80;

  // Service options come from the running containers (plus whatever domains already reference and
  // the configured default), so the service is always picked from a list rather than typed.
  const serviceNames = Array.from(
    new Set(
      [
        defaultService,
        ...(containers ?? []).map((c) => c.service ?? ""),
        ...(domains ?? []).map((d) => d.targetService ?? ""),
      ].filter(Boolean),
    ),
  );
  const serviceOptions: ServiceOption[] = [
    { value: "", label: defaultService ? `default (${defaultService})` : "default" },
    ...serviceNames.map((name) => ({ value: name, label: name })),
  ];

  const [dialog, setDialog] = useState<
    { mode: "add" } | { mode: "edit"; domain: DeploymentDomain }
  >();

  const run = async (action: Promise<unknown>, ok: string) => {
    try {
      await action;
      enqueueSnackbar(ok, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const columns: GridColDef<DeploymentDomain>[] = [
    {
      field: "fqdn",
      headerName: "Domain",
      flex: 1,
      minWidth: 200,
      renderCell: ({ row }) => (
        <Link href={`https://${row.fqdn}`} target="_blank" rel="noopener noreferrer">
          {row.fqdn}
        </Link>
      ),
    },
    ...(isCompose
      ? ([
          {
            field: "targetService",
            headerName: "Service",
            width: 170,
            valueGetter: (value) =>
              value || `default${defaultService ? ` (${defaultService})` : ""}`,
          },
        ] satisfies GridColDef<DeploymentDomain>[])
      : []),
    {
      field: "targetPort",
      headerName: "Port",
      width: 110,
      renderCell: ({ value }) => (
        <Box component="span" sx={{ color: value ? "inherit" : "text.disabled" }}>
          {value ?? defaultPort}
        </Box>
      ),
    },
    {
      field: "actions",
      type: "actions",
      width: 120,
      getActions: ({ row }) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon />}
          label="Edit route"
          onClick={() => setDialog({ mode: "edit", domain: row })}
        />,
        <GridActionsCellItem
          key="primary"
          icon={row.isPrimary ? <StarIcon color="warning" /> : <StarBorderIcon />}
          label={row.isPrimary ? "Primary" : "Make primary"}
          disabled={row.isPrimary || makePrimary.isPending}
          onClick={() => void run(makePrimary.mutateAsync(row.id), "Primary domain updated")}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label="Remove"
          onClick={() => void run(removeDomain.mutateAsync(row.id), "Domain removed")}
        />,
      ],
    },
  ];

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex" }}>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ mode: "add" })}
        >
          Add domain
        </Button>
      </Box>

      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={domains ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          density="compact"
          autoHeight
          hideFooter
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: "No domains yet — add one above." }}
          sx={{ border: 0 }}
        />
      </Box>

      {isCompose && (
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>
          Service/port pin a domain to one compose service and port (e.g.{" "}
          <code>api.example.com → backend:4000</code>). Default routes to the web service.
        </Box>
      )}

      {dialog && (
        <DomainDialog
          deploymentId={deployment.id}
          isCompose={isCompose}
          defaultService={defaultService}
          defaultPort={defaultPort}
          serviceOptions={serviceOptions}
          containers={containers ?? []}
          existing={dialog.mode === "edit" ? dialog.domain : null}
          onClose={() => setDialog(undefined)}
        />
      )}
    </Stack>
  );
}

// Resolves the container backing a target service so the port picker can offer that image's exposed
// ports. For compose, an empty service means the configured web service.
function exposedPortsFor(
  containers: Container[],
  isCompose: boolean,
  service: string,
  defaultService: string,
): number[] {
  if (!isCompose) {
    return containers[0]?.exposedPorts ?? [];
  }

  const wanted = service || defaultService;
  const match = containers.find((container) => container.service === wanted);

  return match?.exposedPorts ?? [];
}

function DomainDialog({
  deploymentId,
  isCompose,
  defaultService,
  defaultPort,
  serviceOptions,
  containers,
  existing,
  onClose,
}: {
  deploymentId: string;
  isCompose: boolean;
  defaultService: string;
  defaultPort: number;
  serviceOptions: ServiceOption[];
  containers: Container[];
  existing: DeploymentDomain | null;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const addDomain = useAddDomain(deploymentId);
  const updateTarget = useUpdateDomainTarget(deploymentId);
  const editing = existing !== null;

  const [fqdn, setFqdn] = useState(existing?.fqdn ?? "");
  const [service, setService] = useState(existing?.targetService ?? "");
  const [port, setPort] = useState(existing?.targetPort ? String(existing.targetPort) : "");

  const exposed = exposedPortsFor(containers, isCompose, service, defaultService);
  const fqdnInvalid = fqdn.trim().length > 0 && !isValidFqdn(fqdn);
  const pending = addDomain.isPending || updateTarget.isPending;

  const submit = async () => {
    if (!editing && !isValidFqdn(fqdn)) {
      enqueueSnackbar("Enter a valid domain (e.g. app.example.com)", { variant: "warning" });

      return;
    }

    const targetService = isCompose && service ? service : null;
    const targetPort = port.trim() ? Number(port) : null;

    try {
      if (editing) {
        await updateTarget.mutateAsync({
          domainId: existing.id,
          body: { targetService, targetPort },
        });
        enqueueSnackbar("Route updated", { variant: "success" });
      } else {
        await addDomain.mutateAsync({ fqdn: fqdn.trim(), targetService, targetPort });
        enqueueSnackbar("Domain added", { variant: "success" });
      }

      onClose();
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? `Edit ${existing.fqdn}` : "Add domain"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {editing ? (
            <TextField
              label="Domain"
              value={existing.fqdn}
              slotProps={{ input: { readOnly: true } }}
            />
          ) : (
            <Box>
              <DomainPicker value={fqdn} onChange={setFqdn} />
              {fqdnInvalid && (
                <Typography variant="caption" color="error" sx={{ ml: 1.75, display: "block" }}>
                  Enter a valid domain, e.g. app.example.com
                </Typography>
              )}
            </Box>
          )}

          {isCompose && (
            <TextField
              select
              label="Service"
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              {serviceOptions.map((option) => (
                <MenuItem key={option.value || "default"} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Autocomplete
            freeSolo
            options={exposed.map((p) => String(p))}
            value={port}
            onChange={(_, next) => setPort(next ?? "")}
            onInputChange={(_, next) => setPort(next)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Port"
                type="number"
                placeholder={String(defaultPort)}
                helperText={
                  exposed.length > 0
                    ? "Pick an exposed port or type one. Blank uses the default."
                    : "No exposed ports detected — type a port, or leave blank for the default."
                }
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={pending || (!editing && !isValidFqdn(fqdn))}
          onClick={() => void submit()}
        >
          {editing ? "Save" : "Add domain"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
