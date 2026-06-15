import { createTheme } from "@mui/material/styles";

// Dark, operations-console feel. Single source of truth for the panel's look.
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#4f9cf9" },
    background: { default: "#0e1116", paper: "#161b22" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: ["Inter", "system-ui", "Avenir", "Helvetica", "Arial", "sans-serif"].join(","),
  },
});
