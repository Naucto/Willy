import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { lazy, Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSystemInfo } from "../api/hooks";
import type { TotpSetupResponse } from "../api/types";
import loginBg from "../assets/login-bg.jpg";
import { useAuth } from "../auth/AuthContext";
import { PasswordField } from "../components/PasswordField";
import { describeError } from "../errors";

// Split out so qrcode.react stays out of the login entry chunk; only loaded during TOTP enrolment.
const QrCode = lazy(() => import("../components/QrCode").then((m) => ({ default: m.QrCode })));

interface LoginForm {
  email: string;
  password: string;
}

interface LocationState {
  from?: { pathname: string };
}

type Step =
  | { kind: "credentials" }
  | { kind: "totp"; challengeToken: string }
  | { kind: "setup"; setup: TotpSetupResponse };

export function LoginPage() {
  const { user, login, completeTotpLogin, beginTotpSetup, completeTotpSetup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  const { data: system } = useSystemInfo();
  const backendReady = Boolean(system);

  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<LoginForm>({ defaultValues: { email: "", password: "" } });

  if (user) {
    return <Navigate to="/deployments" replace />;
  }

  const finish = () => {
    const target = (location.state as LocationState | null)?.from?.pathname ?? "/deployments";
    navigate(target, { replace: true });
  };

  const onSubmitCredentials = handleSubmit(async (values) => {
    try {
      const outcome = await login(values.email, values.password);

      if (outcome.status === "authenticated") {
        finish();
      } else if (outcome.status === "totp_required") {
        setStep({ kind: "totp", challengeToken: outcome.challengeToken });
      } else {
        const setup = await beginTotpSetup(outcome.challengeToken);
        setStep({ kind: "setup", setup });
      }
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  });

  const onSubmitCode = async () => {
    setBusy(true);

    try {
      if (step.kind === "totp") {
        await completeTotpLogin(step.challengeToken, code);
      } else if (step.kind === "setup") {
        await completeTotpSetup(step.setup.setupToken, code);
      }

      finish();
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        height: "100vh",
        backgroundImage: `linear-gradient(rgba(13,40,92,0.6), rgba(8,20,48,0.78)), url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Card sx={{ width: 360, backdropFilter: "blur(2px)", bgcolor: "rgba(22,27,34,0.9)" }}>
        <CardContent>
          <Box
            component="img"
            src="/willy-logo.svg"
            alt="Willy"
            sx={{ height: 56, display: "block", mx: "auto", mb: 3 }}
          />

          {step.kind === "credentials" && (
            <form onSubmit={onSubmitCredentials}>
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  type="email"
                  autoFocus
                  error={Boolean(errors.email)}
                  {...register("email", { required: "Email is required" })}
                  helperText={errors.email?.message}
                />
                <PasswordField
                  label="Password"
                  error={Boolean(errors.password)}
                  {...register("password", { required: "Password is required" })}
                  helperText={errors.password?.message}
                />
                <Button type="submit" variant="contained" disabled={isSubmitting || !backendReady}>
                  {backendReady ? "Sign in" : "Waiting for backend…"}
                </Button>
              </Stack>
            </form>
          )}

          {step.kind !== "credentials" && (
            <Stack spacing={2}>
              {step.kind === "setup" && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Two-factor authentication is required. Scan this with an authenticator app, then
                    enter the 6-digit code.
                  </Typography>
                  <Box sx={{ display: "flex", justifyContent: "center" }}>
                    <Box sx={{ bgcolor: "#fff", p: 1.5, borderRadius: 1 }}>
                      <Suspense fallback={<Box sx={{ width: 160, height: 160 }} />}>
                        <QrCode value={step.setup.otpauthUri} size={160} />
                      </Suspense>
                    </Box>
                  </Box>
                  <TextField
                    label="Secret"
                    value={step.setup.secret}
                    slotProps={{ input: { readOnly: true } }}
                    helperText="Or enter this key manually."
                  />
                </>
              )}

              {step.kind === "totp" && (
                <Typography variant="body2" color="text.secondary">
                  Enter the 6-digit code from your authenticator app.
                </Typography>
              )}

              <TextField
                label="Authentication code"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6 } }}
              />
              <Button
                variant="contained"
                disabled={busy || code.length < 6}
                onClick={() => void onSubmitCode()}
              >
                Verify
              </Button>
              <Button
                color="inherit"
                disabled={busy}
                onClick={() => {
                  setCode("");
                  setStep({ kind: "credentials" });
                }}
              >
                Back
              </Button>
            </Stack>
          )}
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
              Linux {system.kernel} · {system.arch}
            </div>
          </>
        ) : (
          <div>Backend not ready — retrying…</div>
        )}
      </Box>
    </Box>
  );
}
