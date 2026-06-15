import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useRotateWebhook, useUpdateDeployment, useWebhook } from "../api/hooks";
import type { Deployment } from "../api/types";
import { describeError } from "../errors";

// GitHub webhook + auto-deploy controls — its own deployment section. Auto-deploy saves on toggle;
// the secret is generated/rotated and shown once.
export function WebhookTab({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data } = useWebhook(deployment.id);
  const update = useUpdateDeployment(deployment.id);
  const rotate = useRotateWebhook(deployment.id);
  const [secret, setSecret] = useState<string | null>(null);

  const url = data ? `${window.location.origin}${data.path}` : "";

  const onToggleAutoDeploy = async (autoDeploy: boolean) => {
    try {
      await update.mutateAsync({ autoDeploy });
      enqueueSnackbar(autoDeploy ? "Auto-deploy enabled" : "Auto-deploy disabled", {
        variant: "success",
      });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onRotate = async () => {
    try {
      const result = await rotate.mutateAsync();
      setSecret(result.secret);
      enqueueSnackbar("Webhook secret generated", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Card variant="outlined" sx={{ maxWidth: 640 }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            GitHub webhook
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={deployment.autoDeploy}
                disabled={update.isPending}
                onChange={(event) => void onToggleAutoDeploy(event.target.checked)}
              />
            }
            label="Auto-deploy on webhook push"
          />

          {!deployment.autoDeploy && (
            <Alert severity="info">
              Auto-deploy is off — pushes won't deploy until you enable it.
            </Alert>
          )}

          <TextField
            label="Payload URL"
            value={url}
            slotProps={{ input: { readOnly: true } }}
            helperText="Content type: application/json. Configure this URL in the repo's webhooks."
          />

          {secret && (
            <Alert severity="warning" onClose={() => setSecret(null)}>
              Copy this secret into the GitHub webhook now — it won't be shown again:
              <Box sx={{ fontFamily: "monospace", mt: 1, wordBreak: "break-all" }}>{secret}</Box>
            </Alert>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {data?.configured ? "Secret configured" : "No secret set"}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="outlined" onClick={() => void onRotate()} disabled={rotate.isPending}>
              {data?.configured ? "Rotate secret" : "Generate secret"}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
