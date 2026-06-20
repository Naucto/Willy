import AutorenewIcon from "@mui/icons-material/Autorenew";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { IconButton, InputAdornment, TextField, type TextFieldProps, Tooltip } from "@mui/material";
import { type ReactNode, useState } from "react";

export type PasswordFieldProps = TextFieldProps & {
  // When false, the value can't be revealed (no eye) and the field stays masked.
  revealable?: boolean;
  // When provided, shows a "generate a strong password" button before the eye.
  onGenerate?: () => void;
};

// A password TextField with a reveal toggle (and an optional generate button). Forwards every other
// TextField prop, so callers use it as a drop-in replacement for a `type="password"` field.
export function PasswordField({
  revealable = true,
  onGenerate,
  slotProps,
  ...props
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  const adornment: ReactNode =
    onGenerate || revealable ? (
      <InputAdornment position="end">
        {onGenerate && (
          <Tooltip title="Generate a strong password">
            <IconButton size="small" aria-label="Generate password" onClick={onGenerate}>
              <AutorenewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {revealable && (
          <Tooltip title={show ? "Hide" : "Show"}>
            <IconButton
              edge="end"
              size="small"
              aria-label={show ? "Hide password" : "Show password"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShow((value) => !value)}
            >
              {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </InputAdornment>
    ) : undefined;

  const callerInput = typeof slotProps?.input === "object" ? slotProps.input : undefined;

  return (
    <TextField
      {...props}
      type={revealable && show ? "text" : "password"}
      slotProps={{ ...slotProps, input: { ...callerInput, endAdornment: adornment } }}
    />
  );
}
