import { Box, CircularProgress } from "@mui/material";

// Suspense fallback for lazily-loaded routes and heavy tab components — a centered spinner that holds
// the layout while the chunk streams in.
export function PageLoader() {
  return (
    <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
      <CircularProgress />
    </Box>
  );
}
