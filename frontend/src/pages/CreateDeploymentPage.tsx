import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Slider,
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
  imageRef: string;
  buildStrategy: BuildStrategy;
  dockerfilePath: string;
  webServicePort: string;
  healthCheckPath: string;
  runCommand: string;
  cronExpr: string;
  gitToken: string;
  memoryLimitMb: string;
  composeFilePath: string;
  composeWebService: string;
}

const DEFAULTS: FormValues = {
  name: "",
  type: "WEB",
  gitUrl: "",
  gitRef: "main",
  imageRef: "",
  buildStrategy: "DOCKERFILE",
  dockerfilePath: "",
  composeFilePath: "",
  composeWebService: "",
  webServicePort: "",
  healthCheckPath: "/",
  runCommand: "",
  cronExpr: "",
  gitToken: "",
  memoryLimitMb: "",
};

const TYPES: DeploymentType[] = ["WEB", "WORKER", "CRON"];
const STRATEGIES: BuildStrategy[] = ["DOCKERFILE", "NIXPACKS", "COMPOSE", "IMAGE"];

const MEMORY_MARKS = [
  { value: 0, label: "Off" },
  { value: 1024, label: "1G" },
  { value: 2048, label: "2G" },
  { value: 4096, label: "4G" },
];

function trimmed(value: string): string | undefined {
  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function toPayload(values: FormValues): CreateDeploymentInput {
  const payload: CreateDeploymentInput = {
    name: values.name.trim(),
    type: values.type,
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

  set("memoryLimitMb", values.memoryLimitMb ? Number(values.memoryLimitMb) : undefined);

  if (values.buildStrategy === "IMAGE") {
    set("imageRef", trimmed(values.imageRef));
  } else {
    set("gitUrl", trimmed(values.gitUrl));
    set("gitRef", trimmed(values.gitRef));
    set("gitToken", trimmed(values.gitToken));
  }

  if (values.buildStrategy === "DOCKERFILE") {
    set("dockerfilePath", trimmed(values.dockerfilePath));
  }

  if (values.buildStrategy === "COMPOSE") {
    set("composeFilePath", trimmed(values.composeFilePath));
    set("composeWebService", trimmed(values.composeWebService));
  }

  if (values.type === "WEB") {
    set("webServicePort", values.webServicePort ? Number(values.webServicePort) : undefined);
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
  const strategy = watch("buildStrategy");

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
        <Stack spacing={3}>
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

                {strategy === "IMAGE" ? (
                  <TextField
                    label="Image reference"
                    placeholder="nginx:1.27 or ghcr.io/owner/app:tag"
                    error={Boolean(errors.imageRef)}
                    helperText={errors.imageRef?.message ?? "An existing image to run as-is."}
                    {...register("imageRef", {
                      validate: (value) => value.trim().length > 0 || "Image reference is required",
                    })}
                  />
                ) : (
                  <>
                    <TextField
                      label="Git URL"
                      placeholder="https://github.com/owner/repo.git"
                      error={Boolean(errors.gitUrl)}
                      helperText={errors.gitUrl?.message}
                      {...register("gitUrl", {
                        validate: (value) => value.trim().length > 0 || "Git URL is required",
                      })}
                    />

                    <TextField label="Git ref" {...register("gitRef")} />

                    <TextField
                      label="Git token (private repos)"
                      type="password"
                      {...register("gitToken")}
                    />
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
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

                {strategy === "DOCKERFILE" && (
                  <TextField
                    label="Dockerfile path"
                    placeholder="Dockerfile"
                    {...register("dockerfilePath")}
                  />
                )}

                {strategy === "COMPOSE" && (
                  <>
                    <TextField
                      label="Compose file path"
                      placeholder="docker-compose.yml"
                      {...register("composeFilePath")}
                    />
                    <TextField
                      label="Compose web service"
                      placeholder="frontend"
                      helperText="The service Willy routes to the domain and health-checks."
                      {...register("composeWebService")}
                    />
                  </>
                )}

                {type === "WEB" && (
                  <>
                    <TextField label="Service port" type="number" {...register("webServicePort")} />
                    {/* Domains are configured on the deployment's Domains page after creation. */}
                    <Alert severity="info">
                      Add domains from the deployment's <strong>Domains</strong> page after it's
                      created.
                    </Alert>
                    {/* Compose declares its own healthcheck — inferred, not asked here. */}
                    {strategy !== "COMPOSE" && (
                      <TextField label="Health check path" {...register("healthCheckPath")} />
                    )}
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

                <Controller
                  name="memoryLimitMb"
                  control={control}
                  render={({ field }) => {
                    const current = field.value ? Number(field.value) : 0;

                    return (
                      <Box
                        sx={{
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1,
                          px: 2,
                          pt: 1,
                          pb: 0.5,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "baseline", mb: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Memory limit
                          </Typography>
                          <Box sx={{ flexGrow: 1 }} />
                          {current === 0 && (
                            <Typography variant="body2" color="text.secondary">
                              No limit
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
                          <Slider
                            value={current}
                            min={0}
                            max={4096}
                            step={64}
                            marks={MEMORY_MARKS}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(value) => (value === 0 ? "Off" : `${value} MB`)}
                            onChange={(_, value) =>
                              field.onChange(value === 0 ? "" : String(value))
                            }
                            sx={{
                              flexGrow: 1,
                              mx: 1.5,
                              "& .MuiSlider-markLabel": { fontSize: 11 },
                            }}
                          />
                          <TextField
                            label="MB"
                            type="number"
                            size="small"
                            value={field.value}
                            onChange={(event) => field.onChange(event.target.value)}
                            sx={{ width: 96 }}
                          />
                        </Stack>
                      </Box>
                    );
                  }}
                />
              </Stack>
            </CardContent>
          </Card>

          <Alert severity="info">
            After creating, open the deployment to set environment variables and trigger the first
            deploy.
          </Alert>

          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button onClick={() => navigate("/deployments")}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={createDeployment.isPending}>
              Create
            </Button>
          </Box>
        </Stack>
      </form>
    </Stack>
  );
}
