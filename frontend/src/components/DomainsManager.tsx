import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import LanIcon from "@mui/icons-material/LanOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  useAddDomain,
  useAddPortBinding,
  useAppSettings,
  useDeploymentContainers,
  useDeploymentDomains,
  useMakeDomainPrimary,
  usePortBindings,
  useRemoveDomain,
  useRemovePortBinding,
  useSuggestBindingPort,
  useUpdateDomainTarget,
} from "../api/hooks";
import type { Container, Deployment, DeploymentDomain } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { isValidFqdn } from "../domain";
import { describeError } from "../errors";
import { DomainPicker } from "./DomainPicker";
import { Gated } from "./Gated";
import { RunningChip, SelectOption } from "./SelectOption";

interface ServiceOption {
  value: string;
  label: string;
}

// Live multi-domain editor. Each domain can be pinned to a specific container/service (compose
// only) and a specific port; blank falls back to the deployment default. Adding and editing a route
// both go through one modal; changes apply on the next deploy/restart.
export function DomainsManager({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const canOperate = useCan("operate");
  const { data: domains } = useDeploymentDomains(deployment.id);
  const { data: containers } = useDeploymentContainers(deployment.id);
  const { data: settings } = useAppSettings();
  const makePrimary = useMakeDomainPrimary(deployment.id);
  const removeDomain = useRemoveDomain(deployment.id);

  const portBinding = settings?.portBinding;
  const bindingsEnabled = portBinding?.enabled ?? false;

  const isCompose = deployment.buildStrategy === "COMPOSE";
  const defaultService = deployment.strategyConfig.composeWebService ?? "";
  // Port binding lives entirely here now: the fallback for a domain without an explicit port is the
  // first container's first exposed port (matching how the backend resolves it), else 80.
  const defaultPort = (containers ?? [])[0]?.exposedPorts[0] ?? 80;

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
  const [bindingsFor, setBindingsFor] = useState<DeploymentDomain | null>(null);

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
      width: bindingsEnabled ? 160 : 120,
      getActions: ({ row }) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon />}
          label="Edit route"
          disabled={!canOperate}
          onClick={() => setDialog({ mode: "edit", domain: row })}
        />,
        ...(bindingsEnabled
          ? [
              <GridActionsCellItem
                key="bindings"
                icon={<LanIcon />}
                label="Host ports"
                disabled={!canOperate}
                onClick={() => setBindingsFor(row)}
              />,
            ]
          : []),
        <GridActionsCellItem
          key="primary"
          icon={row.isPrimary ? <StarIcon color="warning" /> : <StarBorderIcon />}
          label={row.isPrimary ? "Primary" : "Make primary"}
          disabled={row.isPrimary || makePrimary.isPending || !canOperate}
          onClick={() => void run(makePrimary.mutateAsync(row.id), "Primary domain updated")}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label="Remove"
          disabled={!canOperate}
          onClick={() => void run(removeDomain.mutateAsync(row.id), "Domain removed")}
        />,
      ],
    },
  ];

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex" }}>
        <Box sx={{ flexGrow: 1 }} />
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialog({ mode: "add" })}
          >
            Add domain
          </Button>
        </Gated>
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

      {bindingsFor && portBinding && (
        <PortBindingsDialog
          deploymentId={deployment.id}
          domain={bindingsFor}
          isCompose={isCompose}
          defaultService={defaultService}
          defaultPort={defaultPort}
          serviceOptions={serviceOptions}
          containers={containers ?? []}
          range={{ start: portBinding.start, end: portBinding.end }}
          onClose={() => setBindingsFor(null)}
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
  const canOperate = useCan("operate");
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
              slotProps={{
                select: {
                  renderValue: (v) =>
                    serviceOptions.find((option) => option.value === (v as string))?.label ??
                    (v as string),
                },
              }}
            >
              {serviceOptions.map((option) => {
                const match = containers.find((c) => (c.service ?? "") === option.value);

                return (
                  <MenuItem key={option.value || "default"} value={option.value}>
                    <SelectOption
                      title={option.label}
                      status={match ? <RunningChip running={match.running} /> : undefined}
                      caption={match?.image}
                    />
                  </MenuItem>
                );
              })}
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
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button
            variant="contained"
            disabled={pending || (!editing && !isValidFqdn(fqdn))}
            onClick={() => void submit()}
          >
            {editing ? "Save" : "Add domain"}
          </Button>
        </Gated>
      </DialogActions>
    </Dialog>
  );
}

// Manages the host ports hard-bound to a single domain: many ports can front one domain (each routed
// to its own service/internal port, served on its own Traefik entrypoint with TLS), additive to the
// domain's normal 443 routing. Changes apply on the next deploy/restart.
function PortBindingsDialog({
  deploymentId,
  domain,
  isCompose,
  defaultService,
  defaultPort,
  serviceOptions,
  containers,
  range,
  onClose,
}: {
  deploymentId: string;
  domain: DeploymentDomain;
  isCompose: boolean;
  defaultService: string;
  defaultPort: number;
  serviceOptions: ServiceOption[];
  containers: Container[];
  range: { start: number; end: number };
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const canOperate = useCan("operate");
  const { data: bindings } = usePortBindings(deploymentId, domain.id);
  const addBinding = useAddPortBinding(deploymentId, domain.id);
  const removeBinding = useRemovePortBinding(deploymentId, domain.id);
  const { data: suggested } = useSuggestBindingPort(deploymentId, domain.id, true);

  const [hostPort, setHostPort] = useState("");
  const [service, setService] = useState("");
  const [port, setPort] = useState("");

  const exposed = exposedPortsFor(containers, isCompose, service, defaultService);
  // Prefill the host port with the next free one once known, unless the user already typed something.
  const hostPortValue = hostPort || (suggested ? String(suggested.hostPort) : "");

  const run = async (action: Promise<unknown>, ok: string) => {
    try {
      await action;
      enqueueSnackbar(ok, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const submit = async () => {
    const value = Number.parseInt(hostPortValue, 10);

    if (!Number.isInteger(value) || value < range.start || value > range.end) {
      enqueueSnackbar(`Host port must be within ${range.start}–${range.end}`, {
        variant: "warning",
      });

      return;
    }

    await run(
      addBinding.mutateAsync({
        hostPort: value,
        targetService: isCompose && service ? service : null,
        targetPort: port.trim() ? Number(port) : null,
      }),
      "Port bound",
    );
    setHostPort("");
    setService("");
    setPort("");
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Host ports — {domain.fqdn}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Each bound port serves <code>{domain.fqdn}</code> over TLS on a dedicated host port
            (allocatable range {range.start}–{range.end}), in addition to its normal 443 routing.
          </Typography>

          <Stack spacing={1}>
            {(bindings ?? []).length === 0 && (
              <Typography variant="body2" color="text.disabled">
                No host ports bound yet.
              </Typography>
            )}

            {(bindings ?? []).map((binding) => (
              <Box
                key={binding.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.5,
                  py: 0.75,
                }}
              >
                <Chip size="small" label={`:${binding.hostPort}`} />
                <Link
                  href={`https://${domain.fqdn}:${binding.hostPort}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ flexGrow: 1, fontSize: 13 }}
                >
                  {domain.fqdn}:{binding.hostPort}
                </Link>
                <Typography variant="caption" color="text.secondary">
                  → {isCompose ? `${binding.targetService || defaultService || "default"}:` : ""}
                  {binding.targetPort ?? defaultPort}
                </Typography>
                <Tooltip title="Remove binding">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!canOperate || removeBinding.isPending}
                      onClick={() =>
                        void run(removeBinding.mutateAsync(binding.id), "Port unbound")
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ))}
          </Stack>

          <Stack spacing={1.5} sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
            <Typography variant="subtitle2">Bind a port</Typography>

            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Host port"
                type="number"
                size="small"
                value={hostPortValue}
                slotProps={{ htmlInput: { min: range.start, max: range.end } }}
                onChange={(event) => setHostPort(event.target.value)}
                sx={{ width: 140 }}
              />

              {isCompose && (
                <TextField
                  select
                  label="Service"
                  size="small"
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                  sx={{ flexGrow: 1 }}
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
                sx={{ width: 140 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Internal port"
                    type="number"
                    size="small"
                    placeholder={String(defaultPort)}
                  />
                )}
              />
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button variant="contained" disabled={addBinding.isPending} onClick={() => void submit()}>
            Bind port
          </Button>
        </Gated>
      </DialogActions>
    </Dialog>
  );
}
