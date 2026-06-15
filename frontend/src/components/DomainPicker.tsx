import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef, GridToolbarQuickFilter, Toolbar } from "@mui/x-data-grid";
import { useState } from "react";
import { useDnsZones } from "../api/hooks";

interface ZoneRow {
  zone: string;
}

function PickerToolbar() {
  return (
    <Toolbar>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1, pl: 1 }}>
        Pick a zone
      </Typography>
      <GridToolbarQuickFilter />
    </Toolbar>
  );
}

// Domain selection mirrors the release picker: a dialog whose body is a zones DataGrid (fed by DNS
// auto-discovery). Picking a zone + subdomain composes the FQDN; the result stays editable so a
// domain outside the discovered zones can still be entered by hand.
export function DomainPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (fqdn: string) => void;
  disabled?: boolean;
}) {
  const { data, error } = useDnsZones();
  const zones = data?.zones ?? [];

  const [open, setOpen] = useState(false);
  const [subDomain, setSubDomain] = useState("");
  const [zone, setZone] = useState<string | null>(null);
  const [result, setResult] = useState("");

  const compose = (sub: string, z: string | null): string => {
    if (!z) {
      return sub.trim();
    }

    return sub.trim() ? `${sub.trim()}.${z}` : z;
  };

  const openPicker = () => {
    // Pre-split the current value back into subdomain + zone when it sits in a known zone.
    const match = zones.find((z) => value === z || value.endsWith(`.${z}`));
    const sub = match && value !== match ? value.slice(0, value.length - match.length - 1) : "";

    setZone(match ?? null);
    setSubDomain(match ? sub : value);
    setResult(value);
    setOpen(true);
  };

  const onZone = (picked: string) => {
    setZone(picked);
    setResult(compose(subDomain, picked));
  };

  const onSub = (sub: string) => {
    setSubDomain(sub);
    setResult(compose(sub, zone));
  };

  const confirm = () => {
    onChange(result.trim());
    setOpen(false);
  };

  const columns: GridColDef<ZoneRow>[] = [{ field: "zone", headerName: "Zone", flex: 1 }];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <TextField
          label="Domain"
          value={value}
          placeholder="No domain set"
          fullWidth
          slotProps={{ input: { readOnly: true } }}
        />
        <Tooltip title="Choose domain">
          <span>
            <IconButton onClick={openPicker} disabled={disabled}>
              <TrackChangesIcon />
            </IconButton>
          </span>
        </Tooltip>
        {value && (
          <Tooltip title="Clear domain">
            <span>
              <IconButton onClick={() => onChange("")} disabled={disabled}>
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ ml: 1.75, mt: 0.5, display: "block" }}
      >
        Applies on the next deploy or restart.
      </Typography>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              label="Subdomain"
              value={subDomain}
              placeholder="app (blank = apex)"
              helperText="Leave blank to use the zone root."
              onChange={(event) => onSub(event.target.value)}
            />

            {error ? (
              <Alert severity="warning">
                Couldn't list DNS zones — enter the full domain below.
              </Alert>
            ) : (
              <Box sx={{ height: 320 }}>
                <DataGrid
                  rows={zones.map((z) => ({ zone: z }))}
                  columns={columns}
                  getRowId={(row) => row.zone}
                  getRowClassName={(params) => (params.id === zone ? "willy-active" : "")}
                  onRowClick={(params) => onZone(params.row.zone)}
                  showToolbar
                  slots={{ toolbar: PickerToolbar }}
                  density="compact"
                  disableRowSelectionOnClick
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  sx={{
                    border: 0,
                    "& .willy-active": { bgcolor: "action.selected" },
                    "& .MuiDataGrid-row": { cursor: "pointer" },
                  }}
                />
              </Box>
            )}

            <TextField
              label="Resulting domain"
              value={result}
              placeholder="app.example.com"
              onChange={(event) => setResult(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!result.trim()} onClick={confirm}>
            Use this domain
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
