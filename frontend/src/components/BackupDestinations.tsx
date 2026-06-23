import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useState } from "react";
import { useBackupDestinations, useCreateDestination, useDeleteDestination } from "../api/hooks";
import type { BackupDestination, CreateBackupDestinationInput } from "../api/types";
import { useAction } from "../useAction";
import { OperateButton, OperateIconButton } from "./OperateButton";
import { PasswordField } from "./PasswordField";

const DEST_OPTIONS = [
  {
    value: "S3",
    label: "Amazon S3 / S3-compatible",
    description: "Upload to an S3 bucket or any compatible object store.",
  },
  { value: "FTP", label: "FTP", description: "Send files over plain FTP." },
  { value: "SFTP", label: "SFTP", description: "Secure file transfer over SSH." },
  { value: "SSH", label: "SSH (rsync)", description: "Sync via rsync over an SSH connection." },
] as const;

type DestType = (typeof DEST_OPTIONS)[number]["value"];

export function BackupDestinations() {
  const run = useAction();
  const { data: destinations, isLoading } = useBackupDestinations();
  const deleteDestination = useDeleteDestination();
  const [adding, setAdding] = useState(false);

  const onDelete = (id: string) =>
    run(() => deleteDestination.mutateAsync(id), "Destination deleted");

  const columns: GridColDef<BackupDestination>[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
    { field: "type", headerName: "Type", width: 100 },
    {
      field: "createdAt",
      headerName: "Added",
      width: 180,
      valueFormatter: (value) => new Date(value as string).toLocaleString(),
    },
    {
      field: "actions",
      headerName: "",
      width: 60,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <OperateIconButton size="small" onClick={() => void onDelete(params.row.id)}>
          <DeleteIcon fontSize="small" />
        </OperateIconButton>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Offsite destinations
        </Typography>
        <OperateButton variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          New destination
        </OperateButton>
      </Box>

      <Box sx={{ height: 280 }}>
        <DataGrid
          rows={destinations ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          density="compact"
          disableRowSelectionOnClick
          hideFooter
          sx={{ border: 0 }}
        />
      </Box>

      <NewDestinationDialog open={adding} onClose={() => setAdding(false)} />
    </Box>
  );
}

function NewDestinationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useAction();
  const create = useCreateDestination();
  const [type, setType] = useState<DestType>("S3");
  const [authMethod, setAuthMethod] = useState<"key" | "password">("key");
  const [fields, setFields] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setType("S3");
    setAuthMethod("key");
    setFields({});
  };

  const buildBody = (): CreateBackupDestinationInput => {
    const { port, ...rest } = fields;

    return {
      ...rest,
      name: fields.name ?? "",
      type,
      ...(port ? { port: Number(port) } : {}),
    } as CreateBackupDestinationInput;
  };

  const onCreate = async () => {
    // Server re-tests the connection on create, so a bad destination is never saved.
    if (await run(() => create.mutateAsync(buildBody()), "Destination created")) {
      reset();
      onClose();
    }
  };

  const field = (key: string, label: string, password = false) =>
    password ? (
      <PasswordField
        label={label}
        value={fields[key] ?? ""}
        onChange={(event) => set(key, event.target.value)}
      />
    ) : (
      <TextField
        label={label}
        value={fields[key] ?? ""}
        onChange={(event) => set(key, event.target.value)}
      />
    );

  const ready =
    Boolean(fields.name) &&
    (type === "S3"
      ? Boolean(fields.bucket && fields.accessKeyId && fields.secretAccessKey)
      : type === "SSH"
        ? Boolean(
            fields.host &&
              fields.username &&
              (authMethod === "key" ? fields.privateKey : fields.password),
          )
        : Boolean(fields.host && fields.username && fields.password));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New offsite destination</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {field("name", "Name")}
          <TextField
            select
            label="Type"
            value={type}
            onChange={(event) => setType(event.target.value as DestType)}
            slotProps={{
              select: {
                renderValue: (v) => DEST_OPTIONS.find((o) => o.value === v)?.label ?? (v as string),
              },
            }}
          >
            {DEST_OPTIONS.map((opt) => (
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

          {type === "S3" && (
            <>
              {field("bucket", "Bucket")}
              {field("prefix", "Prefix (optional)")}
              {field("region", "Region (optional)")}
              {field("endpoint", "Endpoint (optional, for non-AWS)")}
              {field("accessKeyId", "Access key ID")}
              {field("secretAccessKey", "Secret access key", true)}
            </>
          )}

          {(type === "FTP" || type === "SFTP") && (
            <>
              {field("host", "Host")}
              {field("port", "Port (optional)")}
              {field("username", "Username")}
              {field("password", "Password", true)}
              {field("path", "Remote path (optional)")}
            </>
          )}

          {type === "SSH" && (
            <>
              {field("host", "Host")}
              {field("port", "Port (optional, default 22)")}
              {field("username", "Username")}
              {field("path", "Remote path (optional)")}
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                color="primary"
                value={authMethod}
                onChange={(_, next: "key" | "password" | null) => {
                  if (!next) {
                    return;
                  }

                  setAuthMethod(next);
                  set(next === "key" ? "password" : "privateKey", "");
                }}
              >
                <ToggleButton value="key">SSH key</ToggleButton>
                <ToggleButton value="password">Password</ToggleButton>
              </ToggleButtonGroup>
              {authMethod === "key" ? (
                <TextField
                  label="Private key (PEM)"
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={fields.privateKey ?? ""}
                  onChange={(event) => set("privateKey", event.target.value)}
                  multiline
                  minRows={3}
                />
              ) : (
                field("password", "Password", true)
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <OperateButton
          variant="contained"
          disabled={create.isPending || !ready}
          onClick={() => void onCreate()}
        >
          Create
        </OperateButton>
      </DialogActions>
    </Dialog>
  );
}
