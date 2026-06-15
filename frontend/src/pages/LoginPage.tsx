import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSystemInfo } from "../api/hooks";
import loginBg from "../assets/login-bg.jpg";
import { useAuth } from "../auth/AuthContext";
import { describeError } from "../errors";

interface LoginForm {
  email: string;
  password: string;
}

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  const { data: system } = useSystemInfo();
  const backendReady = Boolean(system);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<LoginForm>({ defaultValues: { email: "", password: "" } });

  if (user) {
    return <Navigate to="/deployments" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.email, values.password);
      const target = (location.state as LocationState | null)?.from?.pathname ?? "/deployments";
      navigate(target, { replace: true });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  });

  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        height: "100vh",
        // Blue tint layered over the background photo.
        backgroundImage: `linear-gradient(rgba(13,40,92,0.6), rgba(8,20,48,0.78)), url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Card sx={{ width: 360, backdropFilter: "blur(2px)", bgcolor: "rgba(22,27,34,0.9)" }}>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
            Willy 🐋
          </Typography>

          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                autoFocus
                error={Boolean(errors.email)}
                {...register("email", { required: "Email is required" })}
                helperText={errors.email?.message}
              />
              <TextField
                label="Password"
                type="password"
                error={Boolean(errors.password)}
                {...register("password", { required: "Password is required" })}
                helperText={errors.password?.message}
              />
              <Button type="submit" variant="contained" disabled={isSubmitting || !backendReady}>
                {backendReady ? "Sign in" : "Waiting for backend…"}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>

      <Box
        sx={{
          position: "absolute",
          right: 16,
          bottom: 12,
          textAlign: "right",
          color: "rgba(255,255,255,0.6)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        {system ? (
          <>
            <div>
              Willy v{system.version} · {system.commit.slice(0, 12)}
            </div>
            <div>
              {system.distro} · {system.kernel} · {system.arch}
            </div>
          </>
        ) : (
          <div>Backend not ready — retrying…</div>
        )}
      </Box>
    </Box>
  );
}
