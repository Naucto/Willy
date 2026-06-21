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
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useRegisterZone, useUnregisterZone } from "../api/hooks";
import { useAction } from "../useAction";

// The zone-registration config surface: register zones for Willy to manage (handy when the OVH token
// can't auto-list them) and unregister ones added here. Kept separate from the records view.
export function ManageZonesDialog({
  open,
  onClose,
  zones,
}: {
  open: boolean;
  onClose: () => void;
  zones: string[];
}) {
  const run = useAction();
  const register = useRegisterZone();
  const unregister = useUnregisterZone();
  const [zone, setZone] = useState("");

  const onAdd = async () => {
    const value = zone.trim().toLowerCase();

    if (!value) {
      return;
    }

    if (await run(() => register.mutateAsync(value), `Registered ${value}`)) {
      setZone("");
    }
  };

  const onRemove = (value: string) =>
    run(() => unregister.mutateAsync(value), `Unregistered ${value}`);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Manage DNS zones</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            Zones from OVH are discovered automatically. Register a zone here to manage one your
            token can't list, or to pin it explicitly.
          </Alert>

          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              fullWidth
              label="Zone"
              placeholder="example.com"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onAdd();
                }
              }}
            />
            <Button
              variant="contained"
              disabled={register.isPending || zone.trim().length === 0}
              onClick={() => void onAdd()}
            >
              Register
            </Button>
          </Box>

          {zones.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No zones yet.
            </Typography>
          ) : (
            <List dense>
              {zones.map((value) => (
                <ListItem
                  key={value}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      disabled={unregister.isPending}
                      onClick={() => void onRemove(value)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText primary={value} />
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
