import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
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
  Link,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { DataGrid, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  useAddBinding,
  useAddDomain,
  useAppSettings,
  useDeploymentContainers,
  useDeploymentDomains,
  useMakeDomainPrimary,
  useRemoveBinding,
  useRemoveDomain,
  useSuggestBindingPort,
  useUpdateBinding,
  useUpdateDomainTarget,
} from "../api/hooks";
import type { Container, Deployment, DeploymentDomain, PortBinding } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { isValidFqdn } from "../domain";
import { describeError } from "../errors";
import { useAction } from "../useAction";
import { DomainPicker } from "./DomainPicker";
import { Gated } from "./Gated";
import { RunningChip, SelectOption } from "./SelectOption";

interface ServiceOption {
  value: string;
  label: string;
}

// One row of the route grid: a domain's 443 web route, or one of its hard-bound host ports. Both
// kinds can coexist on a single domain, so the grid flattens domains + their bindings into rows.
interface RouteRow {
  id: string;
  domain: DeploymentDomain;
  kind: "web" | "port";
  fqdn: string;
  isPrimary: boolean;
  targetService: string | null;
  targetPort: number | null;
  hostPort: number | null;
  bindingId: string | null;
}

function toRows(domains: DeploymentDomain[]): RouteRow[] {
  return domains.flatMap((domain) => {
    const rows: RouteRow[] = [];

    if (domain.webRoute) {
      rows.push({
        id: `${domain.id}:web`,
        domain,
        kind: "web",
        fqdn: domain.fqdn,
        isPrimary: domain.isPrimary,
        targetService: domain.targetService,
        targetPort: domain.targetPort,
        hostPort: null,
        bindingId: null,
      });
    }

    for (const binding of domain.bindings) {
      rows.push({
        id: binding.id,
        domain,
        kind: "port",
        fqdn: domain.fqdn,
        isPrimary: false,
        targetService: binding.targetService,
        targetPort: binding.targetPort,
        hostPort: binding.hostPort,
        bindingId: binding.id,
      });
    }

    return rows;
  });
}

// Live multi-route editor. Each domain can serve a regular 443 web route and/or one or more hard-bound
// host ports (each on its own Traefik entrypoint with TLS); a route can be pinned to a specific
// container/service (compose only) and port. Adding and editing both go through one modal; changes
// apply on the next deploy/restart.
export function DomainsManager({ deployment }: { deployment: Deployment }) {
  const run = useAction();
  const canOperate = useCan("operate");
  const { data: domains } = useDeploymentDomains(deployment.id);
  const { data: containers } = useDeploymentContainers(deployment.id);
  const { data: settings } = useAppSettings();
  const makePrimary = useMakeDomainPrimary(deployment.id);
  const removeDomain = useRemoveDomain(deployment.id);
  const removeBinding = useRemoveBinding(deployment.id);
  const updateTarget = useUpdateDomainTarget(deployment.id);

  const portBinding = settings?.portBinding;
  const bindingsEnabled = portBinding?.enabled ?? false;

  const isCompose = deployment.buildStrategy === "COMPOSE";
  const defaultService = deployment.strategyConfig.composeWebService ?? "";
  // The fallback for a route without an explicit port is the first container's first exposed port
  // (matching how the backend resolves it), else 80.
  const defaultPort = (containers ?? [])[0]?.exposedPorts[0] ?? 80;

  // Service options come from the running containers (plus whatever domains already reference and the
  // configured default), so the service is always picked from a list rather than typed.
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
    | { mode: "add" }
    | { mode: "edit-web"; domain: DeploymentDomain }
    | { mode: "edit-port"; domain: DeploymentDomain; binding: PortBinding }
  >();

  // Removing a web route off a domain that still fronts host ports keeps the domain (now port-only);
  // removing its last entry drops the whole domain (and its managed DNS).
  const removeRow = (row: RouteRow) => {
    if (row.kind === "web") {
      if (row.domain.bindings.length > 0) {
        return run(
          updateTarget.mutateAsync({
            domainId: row.domain.id,
            body: { webRoute: false, targetService: null, targetPort: null },
          }),
          "Web route removed",
        );
      }

      return run(removeDomain.mutateAsync(row.domain.id), "Domain removed");
    }

    if (!row.domain.webRoute && row.domain.bindings.length <= 1) {
      return run(removeDomain.mutateAsync(row.domain.id), "Domain removed");
    }

    return run(
      removeBinding.mutateAsync({ domainId: row.domain.id, bindingId: row.bindingId ?? "" }),
      "Port unbound",
    );
  };

  const columns: GridColDef<RouteRow>[] = [
    {
      field: "fqdn",
      headerName: "Domain",
      flex: 1,
      minWidth: 200,
      renderCell: ({ row }) => {
        const href =
          row.kind === "port" ? `https://${row.fqdn}:${row.hostPort}` : `https://${row.fqdn}`;

        return (
          <Link href={href} target="_blank" rel="noopener noreferrer">
            {row.fqdn}
          </Link>
        );
      },
    },
    {
      field: "kind",
      headerName: "Type",
      width: 130,
      renderCell: ({ row }) =>
        row.kind === "port" ? (
          <Chip size="small" label={`Port :${row.hostPort}`} />
        ) : (
          <Chip size="small" variant="outlined" label="Web (443)" />
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
        ] satisfies GridColDef<RouteRow>[])
      : []),
    {
      field: "targetPort",
      headerName: "Target port",
      width: 120,
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
      getActions: ({ row }) =>
        row.kind === "web"
          ? [
              <GridActionsCellItem
                key="edit"
                icon={<EditIcon />}
                label="Edit route"
                disabled={!canOperate}
                onClick={() => setDialog({ mode: "edit-web", domain: row.domain })}
              />,
              <GridActionsCellItem
                key="primary"
                icon={row.isPrimary ? <StarIcon color="warning" /> : <StarBorderIcon />}
                label={row.isPrimary ? "Primary" : "Make primary"}
                disabled={row.isPrimary || makePrimary.isPending || !canOperate}
                onClick={() =>
                  void run(makePrimary.mutateAsync(row.domain.id), "Primary domain updated")
                }
              />,
              <GridActionsCellItem
                key="delete"
                icon={<DeleteIcon />}
                label="Remove"
                disabled={!canOperate}
                onClick={() => void removeRow(row)}
              />,
            ]
          : [
              <GridActionsCellItem
                key="edit"
                icon={<EditIcon />}
                label="Edit binding"
                disabled={!canOperate || !row.bindingId}
                onClick={() => {
                  const binding = row.domain.bindings.find((b) => b.id === row.bindingId);

                  if (binding) {
                    setDialog({ mode: "edit-port", domain: row.domain, binding });
                  }
                }}
              />,
              <GridActionsCellItem
                key="delete"
                icon={<DeleteIcon />}
                label="Remove"
                disabled={!canOperate}
                onClick={() => void removeRow(row)}
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
            Add route
          </Button>
        </Gated>
      </Box>

      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={toRows(domains ?? [])}
          columns={columns}
          getRowId={(row) => row.id}
          density="compact"
          autoHeight
          hideFooter
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: "No routes yet — add one above." }}
          sx={{ border: 0 }}
        />
      </Box>

      {isCompose && (
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>
          Service/port pin a route to one compose service and port (e.g.{" "}
          <code>api.example.com → backend:4000</code>). Default routes to the web service.
        </Box>
      )}

      {dialog && (
        <RouteDialog
          deploymentId={deployment.id}
          domains={domains ?? []}
          bindingsEnabled={bindingsEnabled}
          isCompose={isCompose}
          defaultService={defaultService}
          defaultPort={defaultPort}
          serviceOptions={serviceOptions}
          containers={containers ?? []}
          range={portBinding ? { start: portBinding.start, end: portBinding.end } : null}
          edit={
            dialog.mode === "edit-web"
              ? { kind: "web", domain: dialog.domain }
              : dialog.mode === "edit-port"
                ? { kind: "binding", domain: dialog.domain, binding: dialog.binding }
                : null
          }
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

type RouteKind = "domain" | "port";

type RouteEdit =
  | { kind: "web"; domain: DeploymentDomain }
  | { kind: "binding"; domain: DeploymentDomain; binding: PortBinding };

// One dialog for every route operation: add a dedicated domain (443) OR a hard port bind, attaching to
// a brand-new FQDN or an existing domain — and editing an existing web route's or hard port bind's
// target. A hard port bind on a new FQDN creates a port-only domain (no 443); both kinds then coexist.
function RouteDialog({
  deploymentId,
  domains,
  bindingsEnabled,
  isCompose,
  defaultService,
  defaultPort,
  serviceOptions,
  containers,
  range,
  edit,
  onClose,
}: {
  deploymentId: string;
  domains: DeploymentDomain[];
  bindingsEnabled: boolean;
  isCompose: boolean;
  defaultService: string;
  defaultPort: number;
  serviceOptions: ServiceOption[];
  containers: Container[];
  range: { start: number; end: number } | null;
  edit: RouteEdit | null;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const canOperate = useCan("operate");
  const addDomain = useAddDomain(deploymentId);
  const updateTarget = useUpdateDomainTarget(deploymentId);
  const addBinding = useAddBinding(deploymentId);
  const updateBinding = useUpdateBinding(deploymentId);

  const editingBinding = edit?.kind === "binding" ? edit.binding : null;
  const editTarget = editingBinding ?? (edit?.kind === "web" ? edit.domain : null);

  const [kind, setKind] = useState<RouteKind>(editingBinding ? "port" : "domain");
  const [fqdn, setFqdn] = useState(edit?.domain.fqdn ?? "");
  const [service, setService] = useState(editTarget?.targetService ?? "");
  const [port, setPort] = useState(editTarget?.targetPort ? String(editTarget.targetPort) : "");
  const [hostPort, setHostPort] = useState(editingBinding ? String(editingBinding.hostPort) : "");

  const existingDomain = domains.find((d) => d.fqdn === fqdn.trim());
  // Suggestions are global, so any owned domain anchors the lookup; prefer the matched one.
  const anchorDomainId = existingDomain?.id ?? domains[0]?.id ?? "";
  const { data: suggested } = useSuggestBindingPort(
    deploymentId,
    anchorDomainId,
    kind === "port" && !edit && anchorDomainId !== "",
  );
  const hostPortValue = hostPort || (suggested ? String(suggested.hostPort) : "");

  const exposed = exposedPortsFor(containers, isCompose, service, defaultService);
  const fqdnInvalid = fqdn.trim().length > 0 && !isValidFqdn(fqdn);
  const pending =
    addDomain.isPending ||
    updateTarget.isPending ||
    addBinding.isPending ||
    updateBinding.isPending;

  const submit = async () => {
    const fq = fqdn.trim();

    if (!edit && !isValidFqdn(fq)) {
      enqueueSnackbar("Enter a valid domain (e.g. app.example.com)", { variant: "warning" });

      return;
    }

    const targetService = isCompose && service ? service : null;
    const targetPort = port.trim() ? Number(port) : null;
    const hostPortInRange = (value: number): boolean =>
      !!range && Number.isInteger(value) && value >= range.start && value <= range.end;

    try {
      if (kind === "port" && editingBinding && edit) {
        const value = Number.parseInt(hostPortValue, 10);

        if (!hostPortInRange(value)) {
          enqueueSnackbar(`Host port must be within ${range?.start}–${range?.end}`, {
            variant: "warning",
          });

          return;
        }

        await updateBinding.mutateAsync({
          domainId: edit.domain.id,
          bindingId: editingBinding.id,
          body: { hostPort: value, targetService, targetPort },
        });
        enqueueSnackbar("Binding updated", { variant: "success" });
      } else if (kind === "domain") {
        if (edit || existingDomain) {
          const domainId = (edit?.domain ?? existingDomain)?.id ?? "";
          await updateTarget.mutateAsync({
            domainId,
            body: { webRoute: true, targetService, targetPort },
          });
        } else {
          await addDomain.mutateAsync({ fqdn: fq, webRoute: true, targetService, targetPort });
        }

        enqueueSnackbar(edit ? "Route updated" : "Domain added", { variant: "success" });
      } else {
        const value = Number.parseInt(hostPortValue, 10);

        if (!hostPortInRange(value)) {
          enqueueSnackbar(`Host port must be within ${range?.start}–${range?.end}`, {
            variant: "warning",
          });

          return;
        }

        // A bind needs a domain to anchor to; a brand-new FQDN becomes a port-only domain.
        const domainId =
          existingDomain?.id ?? (await addDomain.mutateAsync({ fqdn: fq, webRoute: false })).id;
        await addBinding.mutateAsync({
          domainId,
          body: { hostPort: value, targetService, targetPort },
        });
        enqueueSnackbar("Port bound", { variant: "success" });
      }

      onClose();
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const title = editingBinding
    ? `Edit ${edit?.domain.fqdn}:${editingBinding.hostPort}`
    : edit
      ? `Edit ${edit.domain.fqdn}`
      : "Add route";
  const submitLabel = edit ? "Save" : kind === "port" ? "Bind port" : "Add domain";
  const submitDisabled = pending || (!edit && !isValidFqdn(fqdn));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {!edit && bindingsEnabled && (
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              value={kind}
              onChange={(_, next: RouteKind | null) => next && setKind(next)}
            >
              <ToggleButton value="domain">Dedicated domain</ToggleButton>
              <ToggleButton value="port">Hard port bind</ToggleButton>
            </ToggleButtonGroup>
          )}

          {edit ? (
            <TextField
              label="Domain"
              value={edit.domain.fqdn}
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
              {domains.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1, ml: 1.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                    Attach to:
                  </Typography>
                  {domains.map((d) => (
                    <Chip
                      key={d.id}
                      size="small"
                      label={d.fqdn}
                      variant={existingDomain?.id === d.id ? "filled" : "outlined"}
                      color={existingDomain?.id === d.id ? "primary" : "default"}
                      onClick={() => setFqdn(d.fqdn)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {kind === "port" && (
            <TextField
              label="Host port"
              type="number"
              value={hostPortValue}
              slotProps={{ htmlInput: range ? { min: range.start, max: range.end } : {} }}
              onChange={(event) => setHostPort(event.target.value)}
              helperText={
                range
                  ? `Dedicated TLS host port, allocatable range ${range.start}–${range.end}.`
                  : undefined
              }
              sx={{ width: 200 }}
            />
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
                label={kind === "port" ? "Internal port" : "Port"}
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

          {kind === "port" && !edit && (
            <Typography variant="caption" color="text.secondary">
              Serves the domain over TLS on its own host port, additive to any 443 routing. A new
              domain bound this way is created port-only (no 443 route).
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button variant="contained" disabled={submitDisabled} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </Gated>
      </DialogActions>
    </Dialog>
  );
}
