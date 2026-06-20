import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDeleteUser, useSetUserPassword } from "../api/hooks";
import type { PanelUser } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useCan } from "../auth/permissions";
import { describeError } from "../errors";
import { generatePassword } from "../password";
import { PasswordField } from "./PasswordField";
import { SettingRow } from "./SettingRow";

export function UserSecurityTab({ user }: { user: PanelUser }) {
  const { user: me } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const setPassword = useSetUserPassword();
  const [password, setPasswordValue] = useState("");

  const canAdmin = useCan("admin");
  const isSelf = user.id === me?.userId;

  const onReset = async () => {
    try {
      await setPassword.mutateAsync({ id: user.id, password });
      enqueueSnackbar("Password updated", { variant: "success" });
      setPasswordValue("");
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <Stack spacing={0}>
        <SettingRow
          label="Reset password"
          description="Set a new password for this user. Signs them out everywhere."
        >
          <PasswordField
            label="New password"
            helperText="At least 8 characters."
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            onGenerate={() => setPasswordValue(generatePassword())}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              color="warning"
              variant="contained"
              disabled={setPassword.isPending || password.length < 8}
              onClick={() => void onReset()}
            >
              Reset password
            </Button>
          </Box>
        </SettingRow>
      </Stack>

      {canAdmin && !isSelf && <DangerZone user={user} />}
    </Stack>
  );
}

function DangerZone({ user }: { user: PanelUser }) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const deleteUser = useDeleteUser();

  const onDelete = async () => {
    try {
      await deleteUser.mutateAsync(user.id);
      enqueueSnackbar("User deleted", { variant: "success" });
      navigate("/users", { replace: true });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Paper variant="outlined" sx={{ borderColor: "error.main", p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle2" color="error">
            Delete user
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Permanently removes this account and signs them out. This cannot be undone.
          </Typography>
        </Box>
        <Button
          color="error"
          variant="outlined"
          disabled={deleteUser.isPending}
          onClick={() => void onDelete()}
        >
          Delete user
        </Button>
      </Box>
    </Paper>
  );
}
