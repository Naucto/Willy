import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useDeployments, useDeploymentTransition } from "../api/hooks";
import type { Deployment } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { DeployActions } from "../components/DeployActions";
import { Gated } from "../components/Gated";
import { SystemUtilization } from "../components/ResourceUtilization";
import { StatusBadge } from "../components/StatusBadge";
import { describeError } from "../errors";
import { humanizeType } from "../format";

export function DeploymentsPage() {
  const { data, isLoading, error } = useDeployments();
  const canAdmin = useCan("admin");
  const canOperate = useCan("operate");
  const navigate = useNavigate();

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Deployments
        </Typography>
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            component={RouterLink}
            to="/deployments/new"
          >
            New deployment
          </Button>
        </Gated>
      </Box>

      {canAdmin && <SystemUtilization />}

      {isLoading && (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{describeError(error)}</Alert>}

      {data && data.length === 0 && (
        <Alert severity="info">No deployments yet. Create your first one.</Alert>
      )}

      {data && data.length > 0 && (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>State</TableCell>
                <TableCell>Repository</TableCell>
                <TableCell>Ref</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((deployment) => (
                <DeploymentRow
                  key={deployment.id}
                  deployment={deployment}
                  onOpen={() => navigate(`/deployments/${deployment.id}`)}
                />
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

function DeploymentRow({ deployment, onOpen }: { deployment: Deployment; onOpen: () => void }) {
  const transition = useDeploymentTransition(deployment.id);
  // While a delete is in flight the row points at a deployment that's being torn down — don't let
  // it be opened, and dim it to read as on its way out.
  const deleting = transition === "DELETING";

  return (
    <TableRow
      hover={!deleting}
      sx={{ cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.5 : 1 }}
      onClick={deleting ? undefined : onOpen}
    >
      <TableCell sx={{ fontWeight: 600 }}>{deployment.name}</TableCell>
      <TableCell>{humanizeType(deployment.type)}</TableCell>
      <TableCell>
        <StatusBadge status={transition ?? deployment.state} />
      </TableCell>
      <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
        {deployment.gitUrl}
      </TableCell>
      <TableCell>{deployment.gitRef}</TableCell>
      <TableCell
        align="right"
        onClick={(event) => event.stopPropagation()}
        sx={{ cursor: "default" }}
      >
        <DeployActions deployment={deployment} variant="menu" />
      </TableCell>
    </TableRow>
  );
}
