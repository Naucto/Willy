import {
  Box,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import {
  buildCron,
  type CronFrequency,
  type CronPreset,
  DEFAULT_PRESET,
  describeCron,
  isValidCron,
  parseCron,
} from "../cron";
import { CopyButton } from "./CopyButton";

const FREQUENCIES: { value: CronFrequency; label: string }[] = [
  { value: "minute", label: "Every minute" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom…" },
];

// Monday-first for display; values are cron weekday numbers (0 = Sunday).
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

const pad = (n: number): string => String(n).padStart(2, "0");

interface CronEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}

export function CronEditor({
  value,
  onChange,
  disabled,
  label = "Cron schedule",
}: CronEditorProps) {
  const [preset, setPreset] = useState<CronPreset>(() => parseCron(value) ?? DEFAULT_PRESET);
  const [custom, setCustom] = useState(() => value.trim() !== "" && parseCron(value) === null);
  const lastEmitted = useRef(value);
  const initialized = useRef(false);

  const emit = (next: string): void => {
    lastEmitted.current = next;
    onChange(next);
  };

  // An empty value (e.g. the create wizard) starts on a sensible visual default rather than a
  // blank field that would never schedule anything.
  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    if (value.trim() === "" && !custom) {
      const next = buildCron(preset);
      lastEmitted.current = next;
      onChange(next);
    }
  }, [value, custom, preset, onChange]);

  // Re-derive when the value changes from outside the component (e.g. a different deployment loads).
  useEffect(() => {
    if (value === lastEmitted.current) {
      return;
    }

    lastEmitted.current = value;
    const parsed = parseCron(value);

    if (parsed) {
      setPreset(parsed);
      setCustom(false);
    } else if (value.trim() !== "") {
      setCustom(true);
    }
  }, [value]);

  const applyPreset = (next: CronPreset): void => {
    setPreset(next);
    emit(buildCron(next));
  };

  const onFrequencyChange = (frequency: CronFrequency): void => {
    if (frequency === "custom") {
      setCustom(true);

      return;
    }

    setCustom(false);
    applyPreset({ ...preset, frequency });
  };

  const frequency: CronFrequency = custom ? "custom" : preset.frequency;
  const valid = isValidCron(value);
  const showsTime = frequency === "daily" || frequency === "weekly" || frequency === "monthly";

  return (
    <Stack spacing={1.5}>
      <TextField
        select
        label={label}
        value={frequency}
        disabled={disabled}
        onChange={(event) => onFrequencyChange(event.target.value as CronFrequency)}
      >
        {FREQUENCIES.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      {!custom && frequency === "hourly" && (
        <TextField
          select
          label="At minute"
          value={preset.minute}
          disabled={disabled}
          sx={{ maxWidth: 140 }}
          onChange={(event) => applyPreset({ ...preset, minute: Number(event.target.value) })}
        >
          {MINUTES.map((m) => (
            <MenuItem key={m} value={m}>
              {pad(m)}
            </MenuItem>
          ))}
        </TextField>
      )}

      {!custom && showsTime && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            select
            label="Hour"
            value={preset.hour}
            disabled={disabled}
            sx={{ minWidth: 90 }}
            onChange={(event) => applyPreset({ ...preset, hour: Number(event.target.value) })}
          >
            {HOURS.map((h) => (
              <MenuItem key={h} value={h}>
                {pad(h)}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="body2" color="text.secondary">
            :
          </Typography>
          <TextField
            select
            label="Minute"
            value={preset.minute}
            disabled={disabled}
            sx={{ minWidth: 90 }}
            onChange={(event) => applyPreset({ ...preset, minute: Number(event.target.value) })}
          >
            {MINUTES.map((m) => (
              <MenuItem key={m} value={m}>
                {pad(m)}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            UTC
          </Typography>
        </Stack>
      )}

      {!custom && frequency === "weekly" && (
        <ToggleButtonGroup
          value={preset.weekdays}
          size="small"
          disabled={disabled}
          sx={{ flexWrap: "wrap" }}
          onChange={(_, days: number[]) =>
            applyPreset({ ...preset, weekdays: days.length ? days : preset.weekdays })
          }
        >
          {WEEKDAYS.map((day) => (
            <ToggleButton key={day.value} value={day.value}>
              {day.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {!custom && frequency === "monthly" && (
        <TextField
          select
          label="Day of month"
          value={preset.dayOfMonth}
          disabled={disabled}
          sx={{ maxWidth: 160 }}
          onChange={(event) => applyPreset({ ...preset, dayOfMonth: Number(event.target.value) })}
        >
          {DAYS_OF_MONTH.map((d) => (
            <MenuItem key={d} value={d}>
              {d}
            </MenuItem>
          ))}
        </TextField>
      )}

      {custom && (
        <TextField
          label="Cron expression"
          placeholder="0 3 * * *"
          value={value}
          disabled={disabled}
          error={value.trim() !== "" && !valid}
          onChange={(event) => emit(event.target.value)}
        />
      )}

      {!custom && value.trim() !== "" && (
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            {value}
          </Typography>
          <CopyButton value={value} label="cron expression" />
        </Box>
      )}

      {value.trim() !== "" && (
        <Typography variant="caption" color={valid ? "text.secondary" : "error"}>
          {valid ? describeCron(value) : "Invalid cron expression"}
        </Typography>
      )}
    </Stack>
  );
}
