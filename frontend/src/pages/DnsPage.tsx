import AddIcon from "@mui/icons-material/Add";
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
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useEffect, useState } from "react";
import {
  useCreateDnsRecord,
  useDeleteDnsRecord,
  useDnsRecords,
  useDnsZones,
  useHostPublicIp,
} from "../api/hooks";
import type { CreateDnsRecordInput, DnsRecord } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { Gated } from "../components/Gated";
import { ManageZonesDialog } from "../components/ManageZonesDialog";
import { describeError } from "../errors";
import { useAction } from "../useAction";

const RECORD_TYPE_OPTIONS = [
  { value: "A", label: "A", description: "Maps a hostname to an IPv4 address." },
  { value: "AAAA", label: "AAAA", description: "Maps a hostname to an IPv6 address." },
  { value: "CNAME", label: "CNAME", description: "Aliases a hostname to another hostname." },
  {
    value: "TXT",
    label: "TXT",
    description: "Arbitrary text — used for SPF, DKIM, domain verification, etc.",
  },
  { value: "MX", label: "MX", description: "Designates mail servers for the domain." },
] as const;

type RecordFieldType = (typeof RECORD_TYPE_OPTIONS)[number]["value"];

const EMPTY_RECORD: CreateDnsRecordInput = {
  fieldType: "A",
  subDomain: "",
  target: "",
  ttl: 3600,
};

const emptySelection = (): GridRowSelectionModel => ({ type: "include", ids: new Set() });

export function DnsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const run = useAction();
  const canOperate = useCan("operate");
  const [zone, setZone] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CreateDnsRecordInput>(EMPTY_RECORD);
  const [selection, setSelection] = useState<GridRowSelectionModel>(emptySelection);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [manageZones, setManageZones] = useState(false);

  const { data: zones, error: zonesError } = useDnsZones();
  const zoneList = zones?.zones ?? [];
  const { data: records, isLoading, error } = useDnsRecords(zone);
  const { data: hostIp } = useHostPublicIp();

  const isAddressRecord = draft.fieldType === "A" || draft.fieldType === "AAAA";

  // Auto-select the first discovered zone so records show without an extra click.
  useEffect(() => {
    const first = zoneList[0];

    if (!zone && first) {
      setZone(first);
    }
  }, [zoneList, zone]);
  const createRecord = useCreateDnsRecord(zone);
  const deleteRecord = useDeleteDnsRecord(zone);

  // The grid selection is an include/exclude model; resolve it to concrete record ids.
  const allIds = (records ?? []).map((record) => record.id);
  const selectedIds =
    selection.type === "include"
      ? allIds.filter((id) => selection.ids.has(id))
      : allIds.filter((id) => !selection.ids.has(id));

  const onDelete = (record: DnsRecord) =>
    run(() => deleteRecord.mutateAsync(record.id), "Record deleted");

  const onBulkDelete = async () => {
    setBulkBusy(true);

    const results = await Promise.allSettled(selectedIds.map((id) => deleteRecord.mutateAsync(id)));
    const failed = results.filter((result) => result.status === "rejected").length;

    setBulkBusy(false);
    setConfirmBulk(false);
    setSelection(emptySelection());

    if (failed > 0) {
      enqueueSnackbar(`Deleted ${selectedIds.length - failed}, ${failed} failed`, {
        variant: "warning",
      });
    } else {
      enqueueSnackbar(`Deleted ${selectedIds.length} record(s)`, { variant: "success" });
    }
  };

  const onCreate = async () => {
    if (
      await run(
        () => createRecord.mutateAsync({ ...draft, ttl: draft.ttl ? Number(draft.ttl) : 3600 }),
        "Record created",
      )
    ) {
      setAdding(false);
      setDraft(EMPTY_RECORD);
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
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <IconButton
            size="small"
            disabled={deleteRecord.isPending}
            onClick={() => void onDelete(params.row)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Gated>
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
          onChange={(event) => {
            setZone(event.target.value);
            setSelection(emptySelection());
          }}
        >
          {zoneList.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={() => setManageZones(true)}>
          Manage zones
        </Button>
        {zone && (
          <>
            <Box sx={{ flexGrow: 1 }} />
            {selectedIds.length > 0 && (
              <Gated can={canOperate} reason={ROLE_REASON.operate}>
                <Button
                  color="error"
                  variant="outlined"
                  startIcon={<DeleteIcon />}
                  onClick={() => setConfirmBulk(true)}
                >
                  Delete {selectedIds.length}
                </Button>
              </Gated>
            )}
            <Gated can={canOperate} reason={ROLE_REASON.operate}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                Add record
              </Button>
            </Gated>
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
            checkboxSelection
            disableRowSelectionOnClick
            rowSelectionModel={selection}
            onRowSelectionModelChange={(model) => setSelection(model)}
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
                  fieldType: event.target.value as RecordFieldType,
                })
              }
              slotProps={{
                select: {
                  renderValue: (v) =>
                    RECORD_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? (v as string),
                },
              }}
            >
              {RECORD_TYPE_OPTIONS.map((opt) => (
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
            {isAddressRecord && hostIp?.ip && (
              <Button
                size="small"
                sx={{ alignSelf: "flex-start" }}
                onClick={() => setDraft({ ...draft, target: hostIp.ip ?? "" })}
              >
                Use this host ({hostIp.ip})
              </Button>
            )}
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
          <Gated can={canOperate} reason={ROLE_REASON.operate}>
            <Button
              variant="contained"
              disabled={createRecord.isPending || !draft.target.trim()}
              onClick={() => void onCreate()}
            >
              Create
            </Button>
          </Gated>
        </DialogActions>
      </Dialog>

      <ManageZonesDialog
        open={manageZones}
        onClose={() => setManageZones(false)}
        zones={zoneList}
      />

      <Dialog open={confirmBulk} onClose={() => setConfirmBulk(false)} maxWidth="xs">
        <DialogTitle>Delete {selectedIds.length} record(s)?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This permanently removes the selected records from {zone}. This can't be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBulk(false)}>Cancel</Button>
          <Gated can={canOperate} reason={ROLE_REASON.operate}>
            <Button
              color="error"
              variant="contained"
              disabled={bulkBusy}
              onClick={() => void onBulkDelete()}
            >
              Delete
            </Button>
          </Gated>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
