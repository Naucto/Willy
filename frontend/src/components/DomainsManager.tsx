import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  Box,
  Button,
  Card,
  CardContent,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  DataGrid,
  GridActionsCellItem,
  type GridColDef,
  type GridRowModel,
} from "@mui/x-data-grid";
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
import type { Deployment, DeploymentDomain } from "../api/types";
import { describeError } from "../errors";
import { DomainPicker } from "./DomainPicker";

// Live multi-domain editor. Each domain can be pinned to a specific container/service (compose
// only) and a specific port; blank falls back to the deployment default. Changes apply on the next
// deploy/restart.
export function DomainsManager({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: domains } = useDeploymentDomains(deployment.id);
  const { data: containers } = useDeploymentContainers(deployment.id);
  const addDomain = useAddDomain(deployment.id);
  const makePrimary = useMakeDomainPrimary(deployment.id);
  const removeDomain = useRemoveDomain(deployment.id);
  const updateTarget = useUpdateDomainTarget(deployment.id);

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
  const serviceOptions = [
    { value: "", label: defaultService ? `default (${defaultService})` : "default" },
    ...serviceNames.map((name) => ({ value: name, label: name })),
  ];

  const [fqdn, setFqdn] = useState("");
  const [service, setService] = useState("");
  const [port, setPort] = useState("");

  const run = async (action: Promise<unknown>, ok: string) => {
    try {
      await action;
      enqueueSnackbar(ok, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onAdd = async () => {
    if (!fqdn.trim()) {
      return;
    }

    await run(
      addDomain.mutateAsync({
        fqdn: fqdn.trim(),
        targetService: isCompose && service ? service : null,
        targetPort: port.trim() ? Number(port) : null,
      }),
      "Domain added",
    );
    setFqdn("");
    setService("");
    setPort("");
  };

  // DataGrid commits an edited row here; persist the service/port target and surface failures so
  // the grid reverts the cell.
  const processRowUpdate = async (next: GridRowModel<DeploymentDomain>) => {
    const targetService =
      isCompose && typeof next.targetService === "string" && next.targetService.trim()
        ? next.targetService.trim()
        : null;
    const targetPort = next.targetPort ? Number(next.targetPort) : null;

    await updateTarget.mutateAsync({ domainId: next.id, body: { targetService, targetPort } });
    enqueueSnackbar("Route updated", { variant: "success" });

    return { ...next, targetService, targetPort };
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
            editable: true,
            type: "singleSelect",
            valueOptions: serviceOptions,
            valueGetter: (value) => value ?? "",
          },
        ] satisfies GridColDef<DeploymentDomain>[])
      : []),
    {
      field: "targetPort",
      headerName: "Port",
      width: 110,
      editable: true,
      type: "number",
      renderCell: ({ value }) =>
        value ? (
          String(value)
        ) : (
          <Typography variant="body2" color="text.disabled">
            {defaultPort}
          </Typography>
        ),
    },
    {
      field: "actions",
      type: "actions",
      width: 90,
      getActions: ({ row }) => [
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
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            Domains
          </Typography>

          <Box sx={{ width: "100%" }}>
            <DataGrid
              rows={domains ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              editMode="cell"
              processRowUpdate={processRowUpdate}
              onProcessRowUpdateError={(error) =>
                enqueueSnackbar(describeError(error), { variant: "error" })
              }
              density="compact"
              autoHeight
              hideFooter
              disableRowSelectionOnClick
              localeText={{ noRowsLabel: "No domains yet — add one below." }}
              sx={{ border: 0 }}
            />
          </Box>

          <Stack spacing={1.5}>
            <DomainPicker value={fqdn} onChange={setFqdn} />
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              {isCompose && (
                <TextField
                  select
                  size="small"
                  label="Service"
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                  sx={{ width: 180 }}
                >
                  {serviceOptions.map((option) => (
                    <MenuItem key={option.value || "default"} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                size="small"
                label="Port"
                type="number"
                placeholder={String(defaultPort)}
                value={port}
                onChange={(event) => setPort(event.target.value)}
                sx={{ width: 110 }}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                disabled={addDomain.isPending || !fqdn.trim()}
                onClick={() => void onAdd()}
              >
                Add domain
              </Button>
            </Box>
          </Stack>

          {isCompose && (
            <Typography variant="caption" color="text.secondary">
              Service/port pin a domain to one compose service and port (e.g.{" "}
              <code>api.example.com → backend:4000</code>). Default routes to the web service.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
