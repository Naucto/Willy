import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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
      sx={{ display: "grid", placeItems: "center", height: "100vh", bgcolor: "background.default" }}
    >
      <Card sx={{ width: 360 }}>
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
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                Sign in
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
