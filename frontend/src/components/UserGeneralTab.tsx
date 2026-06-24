import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useSetUserDisabled, useUpdateUser } from "../api/hooks";
import type { PanelUser, Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useCan } from "../auth/permissions";
import { useAction } from "../useAction";
import { ConfirmDialog } from "./ConfirmDialog";
import { RoleSelect } from "./RoleSelect";
import { SettingRow } from "./SettingRow";

export function UserGeneralTab({ user }: { user: PanelUser }) {
  const { user: me } = useAuth();
  const isAdmin = useCan("admin");
  const run = useAction();
  const update = useUpdateUser();
  const setDisabled = useSetUserDisabled();

  const [confirmDisable, setConfirmDisable] = useState(false);

  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role as Role);

  // Re-sync when the loaded user changes (e.g. after a save refetch or navigating between users).
  useEffect(() => {
    setName(user.name ?? "");
    setEmail(user.email);
    setRole(user.role as Role);
  }, [user]);

  const isSelf = user.id === me?.userId;

  // Role is editable only for an admin acting on someone else; omit it otherwise so the
  // backend's "only admins can change roles" guard isn't tripped on a self-edit.
  const onSave = () =>
    run(
      () => update.mutateAsync({ id: user.id, name, email, ...(isSelf ? {} : { role }) }),
      "User updated",
    );

  const applyDisabled = (disabled: boolean) =>
    run(
      () => setDisabled.mutateAsync({ id: user.id, disabled }),
      disabled ? "Account disabled" : "Account enabled",
    );

  return (
    <Stack spacing={0} sx={{ maxWidth: 760 }}>
      <SettingRow
        label="Name"
        description="Optional — shown instead of the email across the panel."
      >
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      </SettingRow>

      <SettingRow label="Email" description="Used to sign in and to address the account.">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </SettingRow>

      <SettingRow label="Role" description="Determines what this user can do across Willy.">
        <RoleSelect value={role} disabled={isSelf} onChange={setRole} />
        {isSelf && (
          <Typography variant="caption" color="text.secondary">
            You can't change your own role.
          </Typography>
        )}
      </SettingRow>

      {isAdmin && !isSelf && (
        <SettingRow
          label="Account status"
          description="Disabled accounts can't sign in; existing sessions are revoked."
        >
          <FormControlLabel
            control={
              <Switch
                checked={!user.disabled}
                disabled={setDisabled.isPending}
                onChange={(event) => {
                  if (event.target.checked) {
                    void applyDisabled(false);
                  } else {
                    setConfirmDisable(true);
                  }
                }}
              />
            }
            label={user.disabled ? "Disabled" : "Enabled"}
          />
        </SettingRow>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
        <Button
          variant="contained"
          disabled={update.isPending || !email}
          onClick={() => void onSave()}
        >
          Save changes
        </Button>
      </Box>

      <ConfirmDialog
        open={confirmDisable}
        title="Disable account"
        message={`Disable ${user.name ?? user.email}? They will be signed out and unable to sign in until re-enabled.`}
        confirmLabel="Disable"
        destructive
        onConfirm={() => {
          setConfirmDisable(false);
          void applyDisabled(true);
        }}
        onCancel={() => setConfirmDisable(false)}
      />
    </Stack>
  );
}
