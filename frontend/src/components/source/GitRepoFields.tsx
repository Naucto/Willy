import { Autocomplete, Button, CircularProgress, Stack, TextField } from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useDiscoverBranches } from "../../api/hooks";
import { describeError } from "../../errors";
import type { SourceFieldsProps } from "./sourceTypes";

// Shared git repository fields (URL, branch picker, optional token) reused by the Dockerfile and
// Compose source types. Branches are discovered on demand via `git ls-remote` — no full clone, any
// git remote — and the ref stays free-text so a tag or untracked branch still works.
export function GitRepoFields({ value, onChange, showToken }: SourceFieldsProps) {
  const { enqueueSnackbar } = useSnackbar();
  const discover = useDiscoverBranches();
  const [branches, setBranches] = useState<string[]>([]);

  const loadBranches = async () => {
    const url = value.gitUrl.trim();

    if (!url) {
      return;
    }

    try {
      const token = value.gitToken.trim();
      const result = await discover.mutateAsync(token ? { url, token } : { url });
      setBranches(result.branches);

      if (result.branches.length === 0) {
        enqueueSnackbar("No branches found", { variant: "info" });
      }
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <>
      <TextField
        label="Git URL"
        placeholder="https://github.com/owner/repo.git"
        value={value.gitUrl}
        onChange={(event) => onChange({ gitUrl: event.target.value })}
      />

      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Autocomplete
          freeSolo
          fullWidth
          options={branches}
          inputValue={value.gitRef}
          onInputChange={(_, input) => onChange({ gitRef: input })}
          renderInput={(params) => <TextField {...params} label="Git ref (branch / tag)" />}
        />
        <Button
          onClick={() => void loadBranches()}
          disabled={discover.isPending || value.gitUrl.trim().length === 0}
          sx={{ mt: 1, whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {discover.isPending ? <CircularProgress size={18} /> : "Discover"}
        </Button>
      </Stack>

      {showToken && (
        <TextField
          label="Git token (private repos)"
          type="password"
          value={value.gitToken}
          onChange={(event) => onChange({ gitToken: event.target.value })}
        />
      )}
    </>
  );
}
