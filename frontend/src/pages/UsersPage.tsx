import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateUser, useUsers } from "../api/hooks";
import type { CreateUserInput, PanelUser, Role } from "../api/types";
import { PasswordField } from "../components/PasswordField";
import { RoleSelect } from "../components/RoleSelect";
import { describeError } from "../errors";
import { humanizeRole } from "../format";
import { generatePassword } from "../password";
import { useAction } from "../useAction";

export function UsersPage() {
  const navigate = useNavigate();
  const { data: users, isLoading, error } = useUsers();

  const [adding, setAdding] = useState(false);

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

      {isLoading && (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{describeError(error)}</Alert>}

      {users && users.length > 0 && (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} onOpen={() => navigate(`/users/${user.id}`)} />
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <NewUserDialog open={adding} onClose={() => setAdding(false)} />
    </Stack>
  );
}

function UserRow({ user, onOpen }: { user: PanelUser; onOpen: () => void }) {
  return (
    <TableRow hover sx={{ cursor: "pointer" }} onClick={onOpen}>
      <TableCell sx={{ fontWeight: 600 }}>
        {user.name ?? (
          <Box component="span" sx={{ color: "text.disabled" }}>
            —
          </Box>
        )}
      </TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>{humanizeRole(user.role)}</TableCell>
      <TableCell>{new Date(user.createdAt).toLocaleString()}</TableCell>
    </TableRow>
  );
}

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useAction();
  const create = useCreateUser();
  const [form, setForm] = useState<CreateUserInput>({ email: "", password: "", role: "VIEWER" });

  const onCreate = async () => {
    if (await run(() => create.mutateAsync(form), "User created")) {
      setForm({ email: "", password: "", role: "VIEWER" });
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New user</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            helperText="Optional — shown instead of the email across the panel."
            value={form.name ?? ""}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <PasswordField
            label="Password"
            helperText="At least 8 characters."
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            onGenerate={() => setForm({ ...form, password: generatePassword() })}
          />
          <RoleSelect value={form.role} onChange={(role: Role) => setForm({ ...form, role })} />
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
