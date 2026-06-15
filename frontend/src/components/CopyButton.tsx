import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { IconButton, Tooltip } from "@mui/material";
import { useSnackbar } from "notistack";

export function CopyButton({ value, label = "value" }: { value: string; label?: string }) {
  const { enqueueSnackbar } = useSnackbar();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      enqueueSnackbar(`Copied ${label}`, { variant: "success" });
    } catch {
      enqueueSnackbar("Copy failed", { variant: "error" });
    }
  };

  return (
    <Tooltip title={`Copy ${label}`}>
      <IconButton size="small" onClick={() => void copy()} sx={{ ml: 0.5 }}>
        <ContentCopyIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );
}
