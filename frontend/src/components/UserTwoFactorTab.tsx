import { Alert, Box, Button, Chip, Stack, Switch, TextField, Typography } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import {
  useConfirmTwoFactor,
  useDisableTwoFactor,
  useRequireTwoFactor,
  useStartTwoFactor,
} from "../api/hooks";
import type { PanelUser, TotpSetupResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useCan } from "../auth/permissions";
import { useAction } from "../useAction";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingRow } from "./SettingRow";

function StatusChip({ user }: { user: PanelUser }) {
  if (!user.twoFactorEnabled) {
    return <Chip size="small" label="Off" variant="outlined" />;
  }

  if (!user.twoFactorConfigured) {
    return <Chip size="small" color="warning" label="Pending setup" variant="outlined" />;
  }

  return <Chip size="small" color="success" label="Active" variant="outlined" />;
}

export function UserTwoFactorTab({ user }: { user: PanelUser }) {
  const { user: me } = useAuth();
  const canAdmin = useCan("admin");
  const isSelf = user.id === me?.userId;

  return (
    <Stack spacing={0} sx={{ maxWidth: 760 }}>
      <SettingRow
        label="Two-factor authentication"
        description="A time-based one-time code from an authenticator app, required at sign-in."
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StatusChip user={user} />
        </Box>
        {isSelf ? <SelfControls user={user} /> : canAdmin ? <AdminControls user={user} /> : null}
      </SettingRow>
    </Stack>
  );
}

function SelfControls({ user }: { user: PanelUser }) {
  const run = useAction();
  const start = useStartTwoFactor(user.id);
  const confirm = useConfirmTwoFactor(user.id);
  const disable = useDisableTwoFactor(user.id);

  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  const onStart = () =>
    run(async () => {
      setSetup(await start.mutateAsync());
      setCode("");
    });

  const onConfirm = async () => {
    if (!setup) {
      return;
    }

    if (
      await run(
        () => confirm.mutateAsync({ setupToken: setup.setupToken, code }),
        "Two-factor authentication enabled",
      )
    ) {
      setSetup(null);
      setCode("");
    }
  };

  const onDisable = async () => {
    setConfirmingDisable(false);
    await run(() => disable.mutateAsync(), "Two-factor authentication disabled");
  };

  // The switch reflects the server state; it only flips on once the setup flow is confirmed, and a
  // disable goes through a confirmation modal first.
  const onToggle = (checked: boolean) => {
    if (checked) {
      if (!setup) {
        void onStart();
      }

      return;
    }

    setConfirmingDisable(true);
  };

  return (
    <Stack spacing={2}>
      <Switch
        checked={user.twoFactorConfigured}
        disabled={start.isPending || disable.isPending}
        onChange={(event) => onToggle(event.target.checked)}
      />

      {setup && !user.twoFactorConfigured && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Scan this with an authenticator app, then enter the 6-digit code to finish.
          </Typography>
          <Box sx={{ bgcolor: "#fff", p: 1.5, borderRadius: 1, width: "fit-content" }}>
            <QRCodeSVG value={setup.otpauthUri} size={160} />
          </Box>
          <TextField
            label="Secret"
            value={setup.secret}
            slotProps={{ input: { readOnly: true } }}
            helperText="Or enter this key manually."
          />
          <TextField
            label="Authentication code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6 } }}
          />
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button onClick={() => setSetup(null)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={confirm.isPending || code.length < 6}
              onClick={() => void onConfirm()}
            >
              Enable
            </Button>
          </Box>
        </Stack>
      )}

      <ConfirmDialog
        open={confirmingDisable}
        title="Disable two-factor authentication?"
        message="Your account will no longer require a one-time code at sign-in. You can re-enable it at any time."
        confirmLabel="Disable"
        destructive
        onConfirm={() => void onDisable()}
        onCancel={() => setConfirmingDisable(false)}
      />
    </Stack>
  );
}

function AdminControls({ user }: { user: PanelUser }) {
  const run = useAction();
  const require = useRequireTwoFactor(user.id);
  const disable = useDisableTwoFactor(user.id);

  const [confirmingReset, setConfirmingReset] = useState(false);

  const onRequire = () => run(() => require.mutateAsync(), "Two-factor authentication required");

  const onReset = async () => {
    setConfirmingReset(false);
    await run(() => disable.mutateAsync(), "Two-factor authentication reset");
  };

  const onToggle = (checked: boolean) => {
    if (checked) {
      void onRequire();

      return;
    }

    setConfirmingReset(true);
  };

  return (
    <Stack spacing={2}>
      <Switch
        checked={user.twoFactorEnabled}
        disabled={require.isPending || disable.isPending}
        onChange={(event) => onToggle(event.target.checked)}
      />

      {user.twoFactorEnabled && (
        <Alert severity="info">
          {user.twoFactorConfigured
            ? "This user has an authenticator configured. Turning this off lets them re-enroll if they lost access."
            : "This user must configure an authenticator at their next sign-in."}
        </Alert>
      )}

      <ConfirmDialog
        open={confirmingReset}
        title="Reset this user's 2FA?"
        message="This removes their two-factor requirement and any configured authenticator. They can re-enroll afterwards."
        confirmLabel="Reset 2FA"
        destructive
        onConfirm={() => void onReset()}
        onCancel={() => setConfirmingReset(false)}
      />
    </Stack>
  );
}
