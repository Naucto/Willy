import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useEffect, useState } from "react";
import { useCreateDnsRecord, useDeleteDnsRecord, useDnsRecords, useDnsZones } from "../api/hooks";
import type { CreateDnsRecordInput, DnsRecord } from "../api/types";
import { describeError } from "../errors";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX"] as const;

const EMPTY_RECORD: CreateDnsRecordInput = {
  fieldType: "A",
  subDomain: "",
  target: "",
  ttl: 3600,
};

export function DnsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [zone, setZone] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CreateDnsRecordInput>(EMPTY_RECORD);

  const { data: zones, error: zonesError } = useDnsZones();
  const zoneList = zones?.zones ?? [];
  const { data: records, isLoading, error } = useDnsRecords(zone);

  // Auto-select the first discovered zone so records show without an extra click.
  useEffect(() => {
    const first = zoneList[0];

    if (!zone && first) {
      setZone(first);
    }
  }, [zoneList, zone]);
  const createRecord = useCreateDnsRecord(zone);
  const deleteRecord = useDeleteDnsRecord(zone);

  const onDelete = async (record: DnsRecord) => {
    try {
      await deleteRecord.mutateAsync(record.id);
      enqueueSnackbar("Record deleted", { variant: "success" });
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  const onCreate = async () => {
    try {
      await createRecord.mutateAsync({ ...draft, ttl: draft.ttl ? Number(draft.ttl) : 3600 });
      enqueueSnackbar("Record created", { variant: "success" });
      setAdding(false);
      setDraft(EMPTY_RECORD);
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  const columns: GridColDef<DnsRecord>[] = [
    { field: "fieldType", headerName: "Type", width: 90 },
    {
      field: "subDomain",
      headerName: "Subdomain",
      width: 180,
      valueGetter: (value) => (value as string) || "(apex)",
    },
    { field: "target", headerName: "Target", flex: 1, minWidth: 220 },
    { field: "ttl", headerName: "TTL", width: 90 },
    {
      field: "actions",
      headerName: "",
      width: 70,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <IconButton
          size="small"
          disabled={deleteRecord.isPending}
          onClick={() => void onDelete(params.row)}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Stack spacing={3}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        DNS
      </Typography>

      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <TextField
          select
          label="Zone"
          value={zone}
          disabled={zoneList.length === 0}
          sx={{ minWidth: 320 }}
          onChange={(event) => setZone(event.target.value)}
        >
          {zoneList.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        {zone && (
          <>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" onClick={() => setAdding(true)}>
              Add record
            </Button>
          </>
        )}
      </Box>

      {zonesError && <Alert severity="warning">{describeError(zonesError)}</Alert>}

      {!zonesError && zoneList.length === 0 && (
        <Alert severity="info">No DNS zones available.</Alert>
      )}

      {zone && error && <Alert severity="error">{describeError(error)}</Alert>}

      {zone && !error && (
        <Box sx={{ height: 540 }}>
          <DataGrid
            rows={records ?? []}
            columns={columns}
            loading={isLoading}
            getRowId={(row) => row.id}
            showToolbar
            density="compact"
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{ border: 0 }}
          />
        </Box>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add DNS record · {zone}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Type"
              value={draft.fieldType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  fieldType: event.target.value as CreateDnsRecordInput["fieldType"],
                })
              }
            >
              {RECORD_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Subdomain"
              placeholder="app (blank = apex)"
              value={draft.subDomain}
              onChange={(event) => setDraft({ ...draft, subDomain: event.target.value })}
            />
            <TextField
              label="Target"
              placeholder="203.0.113.10"
              value={draft.target}
              onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            />
            <TextField
              label="TTL (seconds)"
              type="number"
              value={draft.ttl ?? 3600}
              onChange={(event) => setDraft({ ...draft, ttl: Number(event.target.value) })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={createRecord.isPending || !draft.target.trim()}
            onClick={() => void onCreate()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
