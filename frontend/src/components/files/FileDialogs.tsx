import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { VolumeIdentity } from "../../api/types";
import { BaseDialog } from "../BaseDialog";
import { OperateButton } from "../OperateButton";
import { FolderPicker } from "./FolderPicker";
import { baseOf, dirOf, isMoveInvalid, joinPath } from "./paths";
import { modeToMatrix, type PermMatrix, parseIdInput, withMatrix } from "./perms";

// Create a file/folder or rename — a single validated name field. `taken` names are rejected so a
// rename/keep-both can't silently clobber an existing sibling.
export function NameDialog({
  title,
  label,
  initial = "",
  confirmLabel = "Create",
  taken = [],
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  taken?: string[];
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const badName =
    trimmed.length === 0 || trimmed.includes("/") || trimmed === "." || trimmed === "..";
  const exists = taken.includes(trimmed);
  const invalid = badName || exists;

  return (
    <BaseDialog
      title={title}
      confirmLabel={confirmLabel}
      confirmDisabled={invalid}
      onClose={onClose}
      onConfirm={() => onSubmit(trimmed)}
    >
      <TextField
        autoFocus
        label={label}
        value={name}
        error={exists}
        helperText={exists ? "A file or folder with this name already exists here." : undefined}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !invalid) {
            onSubmit(trimmed);
          }
        }}
      />
    </BaseDialog>
  );
}

// Asks how to resolve a same-name collision when moving an item into a folder that already has one.
export function ConflictDialog({
  name,
  destDir,
  existingIsDir,
  onReplace,
  onRename,
  onCancel,
}: {
  name: string;
  destDir: string;
  existingIsDir: boolean;
  onReplace: () => void;
  onRename: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>"{name}" already exists</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          <code>{destDir}</code> already contains a {existingIsDir ? "folder" : "file"} named "
          {name}
          ". Replace it, keep both (with a new name), or cancel.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onRename}>Keep both</Button>
        <OperateButton color="error" variant="contained" onClick={onReplace}>
          Replace
        </OperateButton>
      </DialogActions>
    </Dialog>
  );
}

// Confirms a destructive delete (recursive for a directory).
export function DeleteDialog({
  name,
  isDir,
  onClose,
  onConfirm,
}: {
  name: string;
  isDir: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete "{name}"?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {isDir
            ? "This permanently deletes the folder and everything inside it. This can't be undone."
            : "This permanently deletes the file. This can't be undone."}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <OperateButton color="error" variant="contained" onClick={onConfirm}>
          Delete
        </OperateButton>
      </DialogActions>
    </Dialog>
  );
}

export interface PermissionsValue {
  mode: string;
  uid: number;
  gid: number;
  recursive: boolean;
}

const SCOPES: { key: keyof PermMatrix; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "group", label: "Group" },
  { key: "other", label: "Other" },
];

const PERMS: { key: keyof PermMatrix["owner"]; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "write", label: "Write" },
  { key: "execute", label: "Execute" },
];

function identityOptions(identities: VolumeIdentity[]): string[] {
  return identities.map((identity) => `${identity.name} (${identity.id})`);
}

function identityLabel(identities: VolumeIdentity[], id: number): string {
  const match = identities.find((identity) => identity.id === id);

  return match ? `${match.name} (${match.id})` : String(id);
}

// chmod + chown in one dialog: an octal field two-way-bound to an Owner/Group/Other × R/W/X matrix,
// plus UID/GID pickers seeded with the volume's users/groups (raw numbers still allowed).
export function PermissionsDialog({
  initial,
  isDir,
  users,
  groups,
  onClose,
  onSubmit,
}: {
  initial: { mode: string; uid: number; gid: number };
  isDir: boolean;
  users: VolumeIdentity[];
  groups: VolumeIdentity[];
  onClose: () => void;
  onSubmit: (value: PermissionsValue) => void;
}) {
  const [mode, setMode] = useState(initial.mode);
  const [uid, setUid] = useState(identityLabel(users, initial.uid));
  const [gid, setGid] = useState(identityLabel(groups, initial.gid));
  const [recursive, setRecursive] = useState(false);

  const matrix = modeToMatrix(mode);
  const modeValid = /^[0-7]{3,4}$/.test(mode);
  const parsedUid = parseIdInput(uid);
  const parsedGid = parseIdInput(gid);
  const invalid = !modeValid || parsedUid === null || parsedGid === null;

  const toggle = (scope: keyof PermMatrix, perm: keyof PermMatrix["owner"], checked: boolean) => {
    const next: PermMatrix = {
      owner: { ...matrix.owner },
      group: { ...matrix.group },
      other: { ...matrix.other },
    };
    next[scope][perm] = checked;
    setMode(withMatrix(mode, next));
  };

  return (
    <BaseDialog
      title="Permissions & ownership"
      confirmLabel="Apply"
      confirmDisabled={invalid}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({
          mode,
          uid: parsedUid ?? initial.uid,
          gid: parsedGid ?? initial.gid,
          recursive: isDir && recursive,
        })
      }
    >
      <TextField
        label="Mode (octal)"
        value={mode}
        error={mode.length > 0 && !modeValid}
        helperText="e.g. 0644 or 0755"
        onChange={(event) => setMode(event.target.value)}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto 1fr 1fr 1fr",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <Box />
        {PERMS.map((perm) => (
          <Typography key={perm.key} variant="caption" sx={{ textAlign: "center" }}>
            {perm.label}
          </Typography>
        ))}
        {SCOPES.map((scope) => (
          <Box key={scope.key} sx={{ display: "contents" }}>
            <Typography variant="body2" color="text.secondary">
              {scope.label}
            </Typography>
            {PERMS.map((perm) => (
              <Box key={perm.key} sx={{ textAlign: "center" }}>
                <Checkbox
                  size="small"
                  checked={matrix[scope.key][perm.key]}
                  onChange={(event) => toggle(scope.key, perm.key, event.target.checked)}
                />
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      <Stack direction="row" spacing={2}>
        <Autocomplete
          freeSolo
          fullWidth
          options={identityOptions(users)}
          inputValue={uid}
          onInputChange={(_event, value) => setUid(value)}
          renderInput={(params) => (
            <TextField {...params} label="Owner UID" error={uid.length > 0 && parsedUid === null} />
          )}
        />
        <Autocomplete
          freeSolo
          fullWidth
          options={identityOptions(groups)}
          inputValue={gid}
          onInputChange={(_event, value) => setGid(value)}
          renderInput={(params) => (
            <TextField {...params} label="Group GID" error={gid.length > 0 && parsedGid === null} />
          )}
        />
      </Stack>

      {isDir && (
        <FormControlLabel
          control={
            <Checkbox
              checked={recursive}
              onChange={(event) => setRecursive(event.target.checked)}
            />
          }
          label="Apply recursively to all contents"
        />
      )}
    </BaseDialog>
  );
}

export function UploadDialog({
  dir,
  onClose,
  onSubmit,
}: {
  dir: string;
  onClose: () => void;
  onSubmit: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <BaseDialog
      title="Upload file"
      confirmLabel="Upload"
      confirmDisabled={!file}
      onClose={onClose}
      onConfirm={() => file && onSubmit(file)}
    >
      <Typography variant="body2" color="text.secondary">
        Upload into <code>{dir}</code>
      </Typography>
      <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      {file && (
        <Alert severity="info">
          {file.name} ({Math.ceil(file.size / 1024)} KB)
        </Alert>
      )}
    </BaseDialog>
  );
}

// Pick a destination folder for a move. Confirm is blocked for no-op (same parent) and illegal
// (into itself/a descendant) destinations.
export function MoveDialog({
  deploymentId,
  volume,
  source,
  onClose,
  onSubmit,
}: {
  deploymentId: string;
  volume: string;
  source: string;
  onClose: () => void;
  onSubmit: (destDir: string) => void;
}) {
  const [dest, setDest] = useState(dirOf(source));
  const noop = dest === dirOf(source);
  const invalid = noop || isMoveInvalid(source, dest);

  return (
    <BaseDialog
      title={`Move ${baseOf(source)}`}
      confirmLabel="Move"
      confirmDisabled={invalid}
      onClose={onClose}
      onConfirm={() => onSubmit(dest)}
    >
      <Typography variant="body2" color="text.secondary">
        Choose a destination folder.
      </Typography>
      <Box
        sx={{
          maxHeight: 320,
          overflow: "auto",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <FolderPicker deploymentId={deploymentId} volume={volume} value={dest} onChange={setDest} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Moves to <code>{joinPath(dest, baseOf(source))}</code>
        {noop ? " (already there)" : ""}
      </Typography>
    </BaseDialog>
  );
}
