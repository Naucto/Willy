import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Alert, Box } from "@mui/material";

export function NoAccess({ reason = "Requires Admin role" }: { reason?: string }) {
  return (
    <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
      <Alert severity="warning" icon={<LockOutlinedIcon />} sx={{ maxWidth: 520 }}>
        You don't have access to this page. {reason}.
      </Alert>
    </Box>
  );
}
