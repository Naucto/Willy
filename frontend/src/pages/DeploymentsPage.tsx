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
import { Link as RouterLink } from "react-router-dom";
import { useDeployments } from "../api/hooks";
import { StatusBadge } from "../components/StatusBadge";
import { describeError } from "../errors";

export function DeploymentsPage() {
  const { data, isLoading, error } = useDeployments();

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Deployments
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={RouterLink}
          to="/deployments/new"
        >
          New deployment
        </Button>
      </Box>

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
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((deployment) => (
                <TableRow key={deployment.id} hover>
                  <TableCell>
                    <RouterLink to={`/deployments/${deployment.id}`}>{deployment.name}</RouterLink>
                  </TableCell>
                  <TableCell>{deployment.type}</TableCell>
                  <TableCell>
                    <StatusBadge status={deployment.state} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {deployment.gitUrl}
                  </TableCell>
                  <TableCell>{deployment.gitRef}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
