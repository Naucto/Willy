import { Autocomplete, TextField } from "@mui/material";
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
  // Tracks which raw URL the current branch list was fetched for, so we can re-fetch when the URL
  // changes without requiring a button click.
  const [branchesLoadedFor, setBranchesLoadedFor] = useState<string | null>(null);

  const loadBranches = async () => {
    const raw = value.gitUrl.trim();

    if (!raw) {
      return;
    }

    // Strip .git suffix before sending to the API — git ls-remote handles both forms, but users
    // often paste URLs without the suffix from browser address bars.
    const url = raw.replace(/\.git$/i, "");

    try {
      const token = value.gitToken.trim();
      const result = await discover.mutateAsync(token ? { url, token } : { url });
      setBranches(result.branches);
      setBranchesLoadedFor(raw);

      if (result.branches.length === 0) {
        enqueueSnackbar("No branches found", { variant: "info" });
      }
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  // Once the remote's refs are known for the current URL, flag a ref the remote doesn't have.
  // Visual-only (non-blocking): discovery can legitimately miss a ref the user is about to push.
  const refLoaded = branchesLoadedFor === value.gitUrl.trim() && branches.length > 0;
  const refMissing =
    refLoaded && value.gitRef.trim().length > 0 && !branches.includes(value.gitRef);

  return (
    <>
      <TextField
        label="Git URL"
        placeholder="https://github.com/owner/repo.git"
        value={value.gitUrl}
        onChange={(event) => onChange({ gitUrl: event.target.value })}
        onBlur={() => void loadBranches()}
      />

      {/* Token sits above the ref so it's present before branch discovery runs (discovery uses it
          for private remotes). */}
      {showToken && (
        <TextField
          label="Git token (private repos)"
          type="password"
          value={value.gitToken}
          onChange={(event) => onChange({ gitToken: event.target.value })}
        />
      )}

      <Autocomplete
        freeSolo
        fullWidth
        options={branches}
        loading={discover.isPending}
        loadingText="Discovering branches…"
        inputValue={value.gitRef}
        onInputChange={(_, input) => onChange({ gitRef: input })}
        onFocus={() => {
          const raw = value.gitUrl.trim();

          if (raw && branchesLoadedFor !== raw && !discover.isPending) {
            void loadBranches();
          }
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Git ref (branch / tag)"
            error={refMissing}
            helperText={refMissing ? "This ref wasn't found on the remote." : undefined}
          />
        )}
      />
    </>
  );
}
