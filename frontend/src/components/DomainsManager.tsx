import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  useAddDomain,
  useDeploymentDomains,
  useMakeDomainPrimary,
  useRemoveDomain,
} from "../api/hooks";
import { describeError } from "../errors";
import { DomainPicker } from "./DomainPicker";

// Live multi-domain editor: a WEB deployment routes every attached FQDN (primary first); changes
// apply on the next deploy/restart.
export function DomainsManager({ deploymentId }: { deploymentId: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: domains } = useDeploymentDomains(deploymentId);
  const addDomain = useAddDomain(deploymentId);
  const makePrimary = useMakeDomainPrimary(deploymentId);
  const removeDomain = useRemoveDomain(deploymentId);
  const [draft, setDraft] = useState("");

  const run = async (action: Promise<unknown>, ok: string) => {
    try {
      await action;
      enqueueSnackbar(ok, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onAdd = async () => {
    if (!draft.trim()) {
      return;
    }

    await run(addDomain.mutateAsync(draft.trim()), "Domain added");
    setDraft("");
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            Domains
          </Typography>

          <List dense disablePadding>
            {(domains ?? []).map((domain) => (
              <ListItem
                key={domain.id}
                disableGutters
                secondaryAction={
                  <Box>
                    <Tooltip title={domain.isPrimary ? "Primary" : "Make primary"}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={domain.isPrimary || makePrimary.isPending}
                          onClick={() =>
                            void run(makePrimary.mutateAsync(domain.id), "Primary domain updated")
                          }
                        >
                          {domain.isPrimary ? (
                            <StarIcon fontSize="small" color="warning" />
                          ) : (
                            <StarBorderIcon fontSize="small" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        onClick={() =>
                          void run(removeDomain.mutateAsync(domain.id), "Domain removed")
                        }
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Link href={`https://${domain.fqdn}`} target="_blank" rel="noopener noreferrer">
                      {domain.fqdn}
                    </Link>
                  }
                  secondary={domain.isPrimary ? "Primary" : undefined}
                />
              </ListItem>
            ))}
            {domains && domains.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No domains yet — add one below.
              </Typography>
            )}
          </List>

          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <Box sx={{ flexGrow: 1 }}>
              <DomainPicker value={draft} onChange={setDraft} />
            </Box>
            <Button
              variant="contained"
              sx={{ mt: 1 }}
              disabled={addDomain.isPending || !draft.trim()}
              onClick={() => void onAdd()}
            >
              Add
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
