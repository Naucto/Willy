import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  Slider,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateDeployment, useHostResources } from "../api/hooks";
import type { CreateDeploymentInput, DeploymentType } from "../api/types";
import { cpuMarks, cpuMax, memoryMarks, memoryMaxMb } from "../components/resourceScale";
import { SOURCE_OPTIONS, SourceFields, sourceDescription } from "../components/source/SourceFields";
import type { SourceValue } from "../components/source/sourceTypes";
import { describeError } from "../errors";

interface WizardState {
  name: string;
  type: DeploymentType;
  source: SourceValue;
  webServicePort: string;
  healthCheckPath: string;
  runCommand: string;
  cronExpr: string;
  memoryLimitMb: number;
  cpuCores: number;
}

const TYPE_OPTIONS: { value: DeploymentType; label: string; description: string }[] = [
  { value: "WEB", label: "Web", description: "HTTP app served on a domain through Traefik." },
  { value: "WORKER", label: "Worker", description: "Long-running process — no domain or port." },
  { value: "CRON", label: "Cron", description: "Runs a command on a schedule." },
];

const STEPS = ["Type", "Source", "Build & run", "Resources", "Review"];

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;

const INITIAL: WizardState = {
  name: "",
  type: "WEB",
  source: {
    buildStrategy: "DOCKERFILE",
    gitUrl: "",
    gitRef: "main",
    gitToken: "",
    imageRef: "",
    dockerfilePath: "",
    composeFilePath: "",
    composeWebService: "",
  },
  webServicePort: "",
  healthCheckPath: "/",
  runCommand: "",
  cronExpr: "",
  memoryLimitMb: 0,
  cpuCores: 0,
};

function trimmed(value: string): string | undefined {
  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

// The blocking validation error for a step, or null if it's complete. Gates the Next/Create button.
function stepError(step: number, state: WizardState): string | null {
  if (step === 0) {
    if (!state.name.trim()) {
      return "Name is required";
    }

    if (!NAME_PATTERN.test(state.name.trim())) {
      return "Name must be lowercase letters, digits and hyphens (1–41 chars)";
    }
  }

  if (step === 1) {
    if (state.source.buildStrategy === "IMAGE") {
      if (!state.source.imageRef.trim()) {
        return "Image reference is required";
      }
    } else if (!state.source.gitUrl.trim()) {
      return "Git URL is required";
    }
  }

  return null;
}

function toPayload(state: WizardState): CreateDeploymentInput {
  const { source } = state;
  const payload: CreateDeploymentInput = {
    name: state.name.trim(),
    type: state.type,
    buildStrategy: source.buildStrategy,
  };

  const set = <K extends keyof CreateDeploymentInput>(
    field: K,
    value: CreateDeploymentInput[K] | undefined,
  ): void => {
    if (value !== undefined) {
      payload[field] = value;
    }
  };

  if (state.memoryLimitMb > 0) {
    set("memoryLimitMb", state.memoryLimitMb);
  }

  if (state.cpuCores > 0) {
    set("nanoCpus", Math.round(state.cpuCores * 1e9));
  }

  if (source.buildStrategy === "IMAGE") {
    set("imageRef", trimmed(source.imageRef));
  } else {
    set("gitUrl", trimmed(source.gitUrl));
    set("gitRef", trimmed(source.gitRef));
    set("gitToken", trimmed(source.gitToken));
  }

  if (source.buildStrategy === "DOCKERFILE") {
    set("dockerfilePath", trimmed(source.dockerfilePath));
  }

  if (source.buildStrategy === "COMPOSE") {
    set("composeFilePath", trimmed(source.composeFilePath));
    set("composeWebService", trimmed(source.composeWebService));
  }

  if (state.type === "WEB") {
    set("webServicePort", state.webServicePort ? Number(state.webServicePort) : undefined);
    set("healthCheckPath", trimmed(state.healthCheckPath));
  }

  if (state.type === "WORKER") {
    set("runCommand", trimmed(state.runCommand));
  }

  if (state.type === "CRON") {
    set("cronExpr", trimmed(state.cronExpr));
    set("runCommand", trimmed(state.runCommand));
  }

  return payload;
}

export function CreateDeploymentPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const createDeployment = useCreateDeployment();
  const { data: host } = useHostResources();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);

  const patch = (update: Partial<WizardState>): void =>
    setState((current) => ({ ...current, ...update }));
  const patchSource = (update: Partial<SourceValue>): void =>
    setState((current) => ({ ...current, source: { ...current.source, ...update } }));

  const error = stepError(step, state);
  const isLast = step === STEPS.length - 1;

  const onCreate = async () => {
    try {
      const deployment = await createDeployment.mutateAsync(toPayload(state));
      enqueueSnackbar(`Created "${deployment.name}"`, { variant: "success" });
      navigate(`/deployments/${deployment.id}`);
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 680 }}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        New deployment
      </Typography>

      <Stepper activeStep={step} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            {step === 0 && <TypeStep state={state} patch={patch} />}
            {step === 1 && <SourceStep state={state} patch={patch} patchSource={patchSource} />}
            {step === 2 && <BuildRunStep state={state} patch={patch} />}
            {step === 3 && <ResourcesStep state={state} patch={patch} host={host} />}
            {step === 4 && <ReviewStep state={state} />}
          </Stack>
        </CardContent>
      </Card>

      {error && step !== 0 && <Alert severity="warning">{error}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Button onClick={() => (step === 0 ? navigate("/deployments") : setStep(step - 1))}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {isLast ? (
          <Button
            variant="contained"
            disabled={createDeployment.isPending || Boolean(error)}
            onClick={() => void onCreate()}
          >
            Create
          </Button>
        ) : (
          <Button variant="contained" disabled={Boolean(error)} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
      </Box>
    </Stack>
  );
}

function TypeStep({
  state,
  patch,
}: {
  state: WizardState;
  patch: (update: Partial<WizardState>) => void;
}) {
  return (
    <>
      <TextField
        label="Name"
        placeholder="my-app"
        value={state.name}
        error={state.name.length > 0 && !NAME_PATTERN.test(state.name)}
        helperText="Lowercase letters, digits and hyphens"
        onChange={(event) => patch({ name: event.target.value })}
      />

      <Typography variant="overline" color="text.secondary">
        Deployment type
      </Typography>
      <RadioGroup
        value={state.type}
        onChange={(event) => patch({ type: event.target.value as DeploymentType })}
      >
        {TYPE_OPTIONS.map((option) => (
          <OptionRow
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
          />
        ))}
      </RadioGroup>
    </>
  );
}

function SourceStep({
  state,
  patchSource,
}: {
  state: WizardState;
  patch: (update: Partial<WizardState>) => void;
  patchSource: (update: Partial<SourceValue>) => void;
}) {
  return (
    <>
      <Typography variant="overline" color="text.secondary">
        Source type
      </Typography>
      <RadioGroup
        value={state.source.buildStrategy}
        onChange={(event) =>
          patchSource({ buildStrategy: event.target.value as SourceValue["buildStrategy"] })
        }
      >
        {SOURCE_OPTIONS.map((option) => (
          <OptionRow
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
          />
        ))}
      </RadioGroup>

      <Divider />

      <SourceFields value={state.source} onChange={patchSource} showToken />
    </>
  );
}

function BuildRunStep({
  state,
  patch,
}: {
  state: WizardState;
  patch: (update: Partial<WizardState>) => void;
}) {
  return (
    <>
      {state.type === "WEB" && (
        <>
          <TextField
            label="Service port"
            type="number"
            value={state.webServicePort}
            onChange={(event) => patch({ webServicePort: event.target.value })}
          />
          {state.source.buildStrategy !== "COMPOSE" && (
            <TextField
              label="Health check path"
              value={state.healthCheckPath}
              onChange={(event) => patch({ healthCheckPath: event.target.value })}
            />
          )}
          <Alert severity="info">
            Add domains from the deployment's <strong>Domains</strong> page after it's created.
          </Alert>
        </>
      )}

      {state.type === "WORKER" && (
        <TextField
          label="Run command"
          value={state.runCommand}
          onChange={(event) => patch({ runCommand: event.target.value })}
        />
      )}

      {state.type === "CRON" && (
        <>
          <TextField
            label="Cron expression"
            placeholder="0 3 * * *"
            value={state.cronExpr}
            onChange={(event) => patch({ cronExpr: event.target.value })}
          />
          <TextField
            label="Run command"
            value={state.runCommand}
            onChange={(event) => patch({ runCommand: event.target.value })}
          />
        </>
      )}
    </>
  );
}

function ResourcesStep({
  state,
  patch,
  host,
}: {
  state: WizardState;
  patch: (update: Partial<WizardState>) => void;
  host: { cpus: number; memoryMb: number } | undefined;
}) {
  const memMax = memoryMaxMb(host?.memoryMb);
  const cpuCeiling = cpuMax(host?.cpus);

  return (
    <>
      <WizardSlider
        label="Memory limit"
        value={state.memoryLimitMb}
        max={memMax}
        step={64}
        marks={memoryMarks(memMax)}
        format={(value) => (value === 0 ? "No limit" : `${value} MB`)}
        onChange={(value) => patch({ memoryLimitMb: value })}
      />
      <WizardSlider
        label="CPU limit"
        value={state.cpuCores}
        max={cpuCeiling}
        step={0.5}
        marks={cpuMarks(cpuCeiling)}
        format={(value) => (value === 0 ? "No limit" : `${value} cores`)}
        onChange={(value) => patch({ cpuCores: value })}
      />
      <Alert severity="info">Resource limits apply on the first (and every) deploy.</Alert>
    </>
  );
}

function ReviewStep({ state }: { state: WizardState }) {
  const { source } = state;
  const rows: [string, string][] = [
    ["Name", state.name || "—"],
    ["Type", state.type],
    ["Source", sourceDescription(source.buildStrategy)],
  ];

  if (source.buildStrategy === "IMAGE") {
    rows.push(["Image", source.imageRef || "—"]);
  } else {
    rows.push(["Repository", source.gitUrl || "—"]);
    rows.push(["Ref", source.gitRef || "main"]);
  }

  if (state.type === "WEB") {
    rows.push(["Port", state.webServicePort || "default"]);
  }

  if (state.type === "CRON") {
    rows.push(["Schedule", state.cronExpr || "—"]);
  }

  rows.push(["Memory", state.memoryLimitMb > 0 ? `${state.memoryLimitMb} MB` : "no limit"]);
  rows.push(["CPU", state.cpuCores > 0 ? `${state.cpuCores} cores` : "no limit"]);

  return (
    <>
      <Typography variant="overline" color="text.secondary">
        Review
      </Typography>
      <Stack spacing={1}>
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: "flex", gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ width: 120 }}>
              {label}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Stack>
      <Alert severity="info">
        After creating, open the deployment to set environment variables and trigger the first
        deploy.
      </Alert>
    </>
  );
}

function OptionRow({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  return (
    <FormControlLabel
      value={value}
      control={<Radio />}
      sx={{ alignItems: "flex-start", mb: 1, "& .MuiRadio-root": { pt: 0.5 } }}
      label={
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        </Box>
      }
    />
  );
}

function WizardSlider({
  label,
  value,
  max,
  step,
  marks,
  format,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  marks: { value: number; label: string }[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, pl: 2, pr: 3, pt: 1, pb: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" color="text.secondary">
          {format(value)}
        </Typography>
      </Box>
      <Slider
        value={value}
        min={0}
        max={max}
        step={step}
        marks={marks}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => format(v)}
        onChange={(_, v) => onChange(typeof v === "number" ? v : (v[0] ?? 0))}
        sx={{ mx: 1.5, "& .MuiSlider-markLabel": { fontSize: 11 } }}
      />
    </Box>
  );
}
