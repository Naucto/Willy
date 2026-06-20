import { Alert, Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
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
import { describeError } from "../errors";
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
  const { enqueueSnackbar } = useSnackbar();
  const start = useStartTwoFactor(user.id);
  const confirm = useConfirmTwoFactor(user.id);
  const disable = useDisableTwoFactor(user.id);

  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");

  const onStart = async () => {
    try {
      setSetup(await start.mutateAsync());
      setCode("");
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onConfirm = async () => {
    if (!setup) {
      return;
    }

    try {
      await confirm.mutateAsync({ setupToken: setup.setupToken, code });
      enqueueSnackbar("Two-factor authentication enabled", { variant: "success" });
      setSetup(null);
      setCode("");
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onDisable = async () => {
    try {
      await disable.mutateAsync();
      enqueueSnackbar("Two-factor authentication disabled", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  if (user.twoFactorConfigured) {
    return (
      <Box>
        <Button
          color="warning"
          variant="outlined"
          disabled={disable.isPending}
          onClick={() => void onDisable()}
        >
          Disable
        </Button>
      </Box>
    );
  }

  if (!setup) {
    return (
      <Box>
        <Button variant="contained" disabled={start.isPending} onClick={() => void onStart()}>
          Set up
        </Button>
      </Box>
    );
  }

  return (
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
  );
}

function AdminControls({ user }: { user: PanelUser }) {
  const { enqueueSnackbar } = useSnackbar();
  const require = useRequireTwoFactor(user.id);
  const disable = useDisableTwoFactor(user.id);

  const onRequire = async () => {
    try {
      await require.mutateAsync();
      enqueueSnackbar("Two-factor authentication required", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onReset = async () => {
    try {
      await disable.mutateAsync();
      enqueueSnackbar("Two-factor authentication reset", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  if (!user.twoFactorEnabled) {
    return (
      <Box>
        <Button variant="contained" disabled={require.isPending} onClick={() => void onRequire()}>
          Require 2FA
        </Button>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        {user.twoFactorConfigured
          ? "This user has an authenticator configured. Resetting lets them re-enroll if they lost access."
          : "This user must configure an authenticator at their next sign-in."}
      </Alert>
      <Box>
        <Button
          color="warning"
          variant="outlined"
          disabled={disable.isPending}
          onClick={() => void onReset()}
        >
          Reset 2FA
        </Button>
      </Box>
    </Stack>
  );
}
