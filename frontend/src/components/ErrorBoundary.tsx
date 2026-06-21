import { Alert, AlertTitle, Box, Button, Stack } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { describeError } from "../errors";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render-time errors in the routed page subtree so a single broken page shows a recoverable
// panel instead of unmounting the whole app. Reset by remounting (the router keys it on the path).
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the component stack in the console for debugging; the panel shows a friendly message.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private readonly reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <Box sx={{ maxWidth: 640 }}>
        <Alert severity="error" variant="outlined">
          <AlertTitle>Something went wrong</AlertTitle>
          {describeError(error)}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button size="small" variant="contained" onClick={this.reset}>
              Try again
            </Button>
            <Button size="small" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </Stack>
        </Alert>
      </Box>
    );
  }
}
