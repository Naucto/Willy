import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import KeyIcon from "@mui/icons-material/Key";
import {
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
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  useCreateUser,
  useDeleteUser,
  useSetUserPassword,
  useSetUserRole,
  useUsers,
} from "../api/hooks";
import type { CreateUserInput, PanelUser, Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { describeError } from "../errors";

const ROLES: Role[] = ["ADMIN", "OPERATOR", "VIEWER"];

export function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user: me } = useAuth();
  const { data: users, isLoading } = useUsers();
  const setRole = useSetUserRole();
  const deleteUser = useDeleteUser();

  const [adding, setAdding] = useState(false);
  const [passwordFor, setPasswordFor] = useState<PanelUser | null>(null);

  const onRole = async (id: string, role: Role) => {
    try {
      await setRole.mutateAsync({ id, role });
      enqueueSnackbar("Role updated", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteUser.mutateAsync(id);
      enqueueSnackbar("User deleted", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const columns: GridColDef<PanelUser>[] = [
    { field: "email", headerName: "Email", flex: 1, minWidth: 220 },
    {
      field: "role",
      headerName: "Role",
      width: 160,
      renderCell: (params) => (
        <TextField
          select
          size="small"
          variant="standard"
          value={params.row.role}
          disabled={params.row.id === me?.userId}
          onChange={(event) => void onRole(params.row.id, event.target.value as Role)}
        >
          {ROLES.map((role) => (
            <MenuItem key={role} value={role}>
              {role}
            </MenuItem>
          ))}
        </TextField>
      ),
    },
    {
      field: "createdAt",
      headerName: "Created",
      width: 190,
      valueFormatter: (value) => new Date(value as string).toLocaleString(),
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <Box>
          <Tooltip title="Reset password">
            <IconButton size="small" onClick={() => setPasswordFor(params.row)}>
              <KeyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={params.row.id === me?.userId ? "You can't delete yourself" : "Delete"}>
            <span>
              <IconButton
                size="small"
                disabled={params.row.id === me?.userId}
                onClick={() => void onDelete(params.row.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Users
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          New user
        </Button>
      </Box>

      <Box sx={{ height: 540 }}>
        <DataGrid
          rows={users ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 0 }}
        />
      </Box>

      <NewUserDialog open={adding} onClose={() => setAdding(false)} />
      <SetPasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} />
    </Stack>
  );
}

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const create = useCreateUser();
  const [form, setForm] = useState<CreateUserInput>({ email: "", password: "", role: "VIEWER" });

  const onCreate = async () => {
    try {
      await create.mutateAsync(form);
      enqueueSnackbar("User created", { variant: "success" });
      setForm({ email: "", password: "", role: "VIEWER" });
      onClose();
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New user</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <TextField
            label="Password"
            type="password"
            helperText="At least 8 characters."
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <TextField
            select
            label="Role"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
          >
            {ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {role}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={create.isPending || !form.email || form.password.length < 8}
          onClick={() => void onCreate()}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SetPasswordDialog({ user, onClose }: { user: PanelUser | null; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const setPassword = useSetUserPassword();
  const [password, setPasswordValue] = useState("");

  const onSubmit = async () => {
    if (!user) {
      return;
    }

    try {
      await setPassword.mutateAsync({ id: user.id, password });
      enqueueSnackbar("Password updated", { variant: "success" });
      setPasswordValue("");
      onClose();
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Dialog open={user !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Reset password · {user?.email}</DialogTitle>
      <DialogContent>
        <TextField
          label="New password"
          type="password"
          fullWidth
          sx={{ mt: 1 }}
          helperText="At least 8 characters. Signs the user out everywhere."
          value={password}
          onChange={(event) => setPasswordValue(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={setPassword.isPending || password.length < 8}
          onClick={() => void onSubmit()}
        >
          Update
        </Button>
      </DialogActions>
    </Dialog>
  );
}
