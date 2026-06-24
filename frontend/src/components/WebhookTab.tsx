import { Alert, Box, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useRotateWebhook, useUpdateDeployment, useWebhook } from "../api/hooks";
import type { Deployment } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { useAction } from "../useAction";
import { Gated } from "./Gated";
import { OperateButton } from "./OperateButton";
import { SettingRow } from "./SettingRow";

// GitHub webhook + auto-deploy controls. Auto-deploy saves on toggle; the secret is
// generated/rotated and shown once.
export function WebhookTab({ deployment }: { deployment: Deployment }) {
  const run = useAction();
  const canOperate = useCan("operate");
  const { data } = useWebhook(deployment.id);
  const update = useUpdateDeployment(deployment.id);
  const rotate = useRotateWebhook(deployment.id);
  const [secret, setSecret] = useState<string | null>(null);

  const url = data ? `${window.location.origin}${data.path}` : "";

  const onToggleAutoDeploy = (autoDeploy: boolean) =>
    run(
      () => update.mutateAsync({ autoDeploy }),
      autoDeploy ? "Auto-deploy enabled" : "Auto-deploy disabled",
    );

  const onRotate = () =>
    run(async () => {
      const result = await rotate.mutateAsync();
      setSecret(result.secret);
    }, "Webhook secret generated");

  return (
    <Stack spacing={0} sx={{ maxWidth: 760 }}>
      <SettingRow
        label="Auto-deploy"
        description="Automatically redeploy on every push to the tracked branch when a webhook push event arrives."
      >
        <FormControlLabel
          control={
            <Gated can={canOperate} reason={ROLE_REASON.operate}>
              <Switch
                checked={deployment.autoDeploy}
                disabled={update.isPending}
                onChange={(event) => void onToggleAutoDeploy(event.target.checked)}
              />
            </Gated>
          }
          label={deployment.autoDeploy ? "Enabled" : "Disabled"}
        />
        {!deployment.autoDeploy && (
          <Alert severity="info" sx={{ mt: 0 }}>
            Pushes won't trigger a deploy until auto-deploy is enabled.
          </Alert>
        )}
      </SettingRow>

      <SettingRow
        label="Webhook URL"
        description="Paste this URL into your repository's webhook settings. Use content type application/json."
      >
        <TextField label="Payload URL" value={url} slotProps={{ input: { readOnly: true } }} />
      </SettingRow>

      <SettingRow
        label="Secret"
        description="The HMAC-SHA256 secret used to verify that webhook payloads come from GitHub."
      >
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
          <OperateButton
            variant="outlined"
            onClick={() => void onRotate()}
            disabled={rotate.isPending}
          >
            {data?.configured ? "Rotate secret" : "Generate secret"}
          </OperateButton>
        </Box>
      </SettingRow>
    </Stack>
  );
}
