import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useCreateDeployment } from "../api/hooks";
import type { BuildStrategy, CreateDeploymentInput, DeploymentType } from "../api/types";
import { describeError } from "../errors";

interface FormValues {
  name: string;
  type: DeploymentType;
  gitUrl: string;
  gitRef: string;
  buildStrategy: BuildStrategy;
  dockerfilePath: string;
  webServicePort: string;
  domain: string;
  healthCheckPath: string;
  runCommand: string;
  cronExpr: string;
  gitToken: string;
  memoryLimitMb: string;
}

const DEFAULTS: FormValues = {
  name: "",
  type: "WEB",
  gitUrl: "",
  gitRef: "main",
  buildStrategy: "DOCKERFILE",
  dockerfilePath: "",
  webServicePort: "",
  domain: "",
  healthCheckPath: "/",
  runCommand: "",
  cronExpr: "",
  gitToken: "",
  memoryLimitMb: "",
};

const TYPES: DeploymentType[] = ["WEB", "WORKER", "CRON"];
const STRATEGIES: BuildStrategy[] = ["DOCKERFILE", "NIXPACKS", "COMPOSE"];

function trimmed(value: string): string | undefined {
  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function toPayload(values: FormValues): CreateDeploymentInput {
  const payload: CreateDeploymentInput = {
    name: values.name.trim(),
    type: values.type,
    gitUrl: values.gitUrl.trim(),
    buildStrategy: values.buildStrategy,
  };

  // Only assign when present — exactOptionalPropertyTypes forbids explicit undefined.
  const set = <K extends keyof CreateDeploymentInput>(
    field: K,
    value: CreateDeploymentInput[K] | undefined,
  ): void => {
    if (value !== undefined) {
      payload[field] = value;
    }
  };

  set("gitRef", trimmed(values.gitRef));
  set("dockerfilePath", trimmed(values.dockerfilePath));
  set("gitToken", trimmed(values.gitToken));
  set("memoryLimitMb", values.memoryLimitMb ? Number(values.memoryLimitMb) : undefined);

  if (values.type === "WEB") {
    set("webServicePort", values.webServicePort ? Number(values.webServicePort) : undefined);
    set("domain", trimmed(values.domain));
    set("healthCheckPath", trimmed(values.healthCheckPath));
  }

  if (values.type === "WORKER") {
    set("runCommand", trimmed(values.runCommand));
  }

  if (values.type === "CRON") {
    set("cronExpr", trimmed(values.cronExpr));
    set("runCommand", trimmed(values.runCommand));
  }

  return payload;
}

export function CreateDeploymentPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const createDeployment = useCreateDeployment();
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: DEFAULTS });

  const type = watch("type");

  const onSubmit = handleSubmit(async (values) => {
    try {
      const deployment = await createDeployment.mutateAsync(toPayload(values));
      enqueueSnackbar(`Created "${deployment.name}"`, { variant: "success" });
      navigate(`/deployments/${deployment.id}`);
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  });

  return (
    <Stack spacing={3} sx={{ maxWidth: 640 }}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        New deployment
      </Typography>

      <form onSubmit={onSubmit}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="overline" color="text.secondary">
                Source
              </Typography>

              <TextField
                label="Name"
                placeholder="my-app"
                error={Boolean(errors.name)}
                helperText={errors.name?.message ?? "Lowercase letters, digits and hyphens"}
                {...register("name", {
                  required: "Name is required",
                  pattern: {
                    value: /^[a-z0-9][a-z0-9-]{0,40}$/,
                    message: "lowercase alphanumeric/hyphen, 1-41 chars",
                  },
                })}
              />

              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <TextField select label="Type" {...field}>
                    {TYPES.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />

              <TextField
                label="Git URL"
                placeholder="https://github.com/owner/repo.git"
                error={Boolean(errors.gitUrl)}
                helperText={errors.gitUrl?.message}
                {...register("gitUrl", { required: "Git URL is required" })}
              />

              <TextField label="Git ref" {...register("gitRef")} />

              <TextField
                label="Git token (private repos)"
                type="password"
                {...register("gitToken")}
              />

              <Divider />
              <Typography variant="overline" color="text.secondary">
                Build &amp; run
              </Typography>

              <Controller
                name="buildStrategy"
                control={control}
                render={({ field }) => (
                  <TextField select label="Build strategy" {...field}>
                    {STRATEGIES.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />

              <TextField
                label="Dockerfile path"
                placeholder="Dockerfile"
                {...register("dockerfilePath")}
              />

              {type === "WEB" && (
                <>
                  <TextField label="Service port" type="number" {...register("webServicePort")} />
                  <TextField label="Domain" placeholder="app.example.com" {...register("domain")} />
                  <TextField label="Health check path" {...register("healthCheckPath")} />
                </>
              )}

              {type === "WORKER" && <TextField label="Run command" {...register("runCommand")} />}

              {type === "CRON" && (
                <>
                  <TextField
                    label="Cron expression"
                    placeholder="0 3 * * *"
                    {...register("cronExpr")}
                  />
                  <TextField label="Run command" {...register("runCommand")} />
                </>
              )}

              <TextField label="Memory limit (MB)" type="number" {...register("memoryLimitMb")} />

              <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                <Button onClick={() => navigate("/deployments")}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={createDeployment.isPending}>
                  Create
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Alert severity="info" sx={{ mt: 2 }}>
          After creating, open the deployment to set environment variables and trigger the first
          deploy.
        </Alert>
      </form>
    </Stack>
  );
}
