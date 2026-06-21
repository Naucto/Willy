import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import FileOpenOutlinedIcon from "@mui/icons-material/FileOpenOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Alert, Box, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { downloadFile, fetchDir, readFile } from "../../api/files";
import {
  useChmod,
  useChown,
  useDeleteFile,
  useMkdir,
  useMoveFile,
  useUploadFile,
  useVolumeIdentities,
  useWriteFile,
} from "../../api/hooks";
import type { DirEntry } from "../../api/types";
import { ROLE_REASON, useCan } from "../../auth/permissions";
import { describeError } from "../../errors";
import { useAction } from "../../useAction";
import { decodeBase64ToText, encodeTextToBase64 } from "./encoding";
import {
  ConflictDialog,
  DeleteDialog,
  MoveDialog,
  NameDialog,
  PermissionsDialog,
  UploadDialog,
} from "./FileDialogs";
import { FileEditorTabs } from "./FileEditorTabs";
import { FileTree } from "./FileTree";
import { baseOf, dirOf, isMoveInvalid, joinPath, languageForFile, suggestCopyName } from "./paths";
import type { OpenFile } from "./types";

export function FilesTab({
  deploymentId,
  volume,
  refreshNonce,
}: {
  deploymentId: string;
  volume: string;
  refreshNonce: number;
}) {
  if (!volume) {
    return (
      <Alert severity="info">
        This deployment has no named volumes. Files live in volumes declared by the deployment's
        containers.
      </Alert>
    );
  }

  return (
    <FileManager
      key={volume}
      deploymentId={deploymentId}
      volume={volume}
      refreshNonce={refreshNonce}
    />
  );
}

type DialogState =
  | {
      kind: "name";
      title: string;
      label: string;
      confirm: string;
      initial: string;
      taken?: string[];
      submit: (name: string) => void;
    }
  | { kind: "permissions"; path: string; mode: string; uid: number; gid: number; isDir: boolean }
  | { kind: "upload"; dir: string }
  | { kind: "move"; source: string }
  | { kind: "conflict"; source: string; destDir: string; existingIsDir: boolean; names: string[] }
  | { kind: "delete"; path: string; isDir: boolean }
  | null;

interface MenuState {
  x: number;
  y: number;
  path: string;
  entry: DirEntry | null;
}

function FileManager({
  deploymentId,
  volume,
  refreshNonce,
}: {
  deploymentId: string;
  volume: string;
  refreshNonce: number;
}) {
  const run = useAction();
  const canOperate = useCan("operate");
  const { data: identities } = useVolumeIdentities(deploymentId, volume);

  const write = useWriteFile(deploymentId, volume);
  const mkdir = useMkdir(deploymentId, volume);
  const move = useMoveFile(deploymentId, volume);
  const chmod = useChmod(deploymentId, volume);
  const chown = useChown(deploymentId, volume);
  const del = useDeleteFile(deploymentId, volume);
  const upload = useUploadFile(deploymentId, volume);

  const [treeData, setTreeData] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeDir, setActiveDir] = useState<string>("/");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const loadDir = useCallback(
    (path: string) =>
      run(async () => {
        const res = await fetchDir(deploymentId, volume, path);
        setTreeData((prev) => ({ ...prev, [path]: res.entries }));
      }),
    [run, deploymentId, volume],
  );

  useEffect(() => {
    void loadDir("/");
  }, [loadDir]);

  // Refresh every directory the tree has already loaded — called after any mutation, and from the
  // toolbar Refresh button in the deployment bar (via refreshNonce).
  const reloadLoaded = useCallback(async () => {
    const paths = Object.keys(treeData);
    const results = await Promise.all(
      paths.map((path) =>
        fetchDir(deploymentId, volume, path)
          .then((res) => ({ path, entries: res.entries }))
          .catch(() => null),
      ),
    );

    setTreeData((prev) => {
      const next = { ...prev };

      for (const result of results) {
        if (result) {
          next[result.path] = result.entries;
        }
      }

      return next;
    });
  }, [treeData, deploymentId, volume]);

  const reloadRef = useRef(reloadLoaded);
  reloadRef.current = reloadLoaded;

  useEffect(() => {
    if (refreshNonce === 0) {
      return;
    }

    void reloadRef.current();
  }, [refreshNonce]);

  const openFile = useCallback(
    (path: string) => {
      setActivePath(path);
      setActiveDir(dirOf(path));

      if (openFiles.some((file) => file.path === path)) {
        return;
      }

      setOpenFiles((prev) => [
        ...prev,
        {
          path,
          name: baseOf(path),
          content: "",
          original: "",
          isBinary: false,
          size: 0,
          mode: "",
          uid: 0,
          gid: 0,
          language: languageForFile(baseOf(path)),
          loading: true,
          error: null,
        },
      ]);

      void readFile(deploymentId, volume, path)
        .then((res) => {
          const text = res.isBinary ? "" : decodeBase64ToText(res.contentBase64);

          setOpenFiles((prev) =>
            prev.map((file) =>
              file.path === path
                ? {
                    ...file,
                    content: text,
                    original: text,
                    isBinary: res.isBinary,
                    size: res.size,
                    mode: res.mode,
                    uid: res.uid,
                    gid: res.gid,
                    loading: false,
                    error: null,
                  }
                : file,
            ),
          );
        })
        .catch((error: unknown) => {
          setOpenFiles((prev) =>
            prev.map((file) =>
              file.path === path ? { ...file, loading: false, error: describeError(error) } : file,
            ),
          );
        });
    },
    [openFiles, deploymentId, volume],
  );

  const closeFile = (path: string) => {
    setOpenFiles((prev) => prev.filter((file) => file.path !== path));
    setActivePath((current) => {
      if (current !== path) {
        return current;
      }

      const remaining = openFiles.filter((file) => file.path !== path);

      return remaining[remaining.length - 1]?.path ?? null;
    });
  };

  const changeFile = (path: string, content: string) => {
    setOpenFiles((prev) => prev.map((file) => (file.path === path ? { ...file, content } : file)));
  };

  const saveFile = (path: string) => {
    const file = openFiles.find((candidate) => candidate.path === path);

    if (!file) {
      return;
    }

    void run(
      () =>
        write
          .mutateAsync({ path, contentBase64: encodeTextToBase64(file.content), create: true })
          .then(() => {
            setOpenFiles((prev) =>
              prev.map((candidate) =>
                candidate.path === path ? { ...candidate, original: candidate.content } : candidate,
              ),
            );

            return reloadLoaded();
          }),
      "Saved",
    );
  };

  const downloadPath = (path: string) =>
    run(() => downloadFile(deploymentId, volume, path, baseOf(path)));

  const targetDir = (state: MenuState | null): string => {
    if (!state) {
      return activeDir;
    }

    if (state.entry === null || state.entry.type === "dir") {
      return state.path;
    }

    return dirOf(state.path);
  };

  const promptNewFile = (dir: string) =>
    setDialog({
      kind: "name",
      title: "New file",
      label: "File name",
      confirm: "Create",
      initial: "",
      submit: (name) => {
        const path = joinPath(dir, name);

        void run(
          () =>
            write
              .mutateAsync({ path, contentBase64: "", create: true })
              .then(() => reloadLoaded())
              .then(() => openFile(path)),
          "File created",
        );
        setDialog(null);
      },
    });

  const promptNewFolder = (dir: string) =>
    setDialog({
      kind: "name",
      title: "New folder",
      label: "Folder name",
      confirm: "Create",
      initial: "",
      submit: (name) => {
        const path = joinPath(dir, name);

        void run(
          () =>
            mkdir
              .mutateAsync(path)
              .then(() => reloadLoaded())
              // Mark the new folder loaded-and-empty so the tree shows no (misleading) expand arrow.
              .then(() => setTreeData((prev) => ({ ...prev, [path]: [] }))),
          "Folder created",
        );
        setDialog(null);
      },
    });

  const promptRename = (path: string) =>
    setDialog({
      kind: "name",
      title: "Rename",
      label: "New name",
      confirm: "Rename",
      initial: baseOf(path),
      submit: (name) => {
        const to = joinPath(dirOf(path), name);

        void run(
          () =>
            move.mutateAsync({ from: path, to }).then(() => {
              closeFile(path);

              return reloadLoaded();
            }),
          "Renamed",
        );
        setDialog(null);
      },
    });

  const performMove = (source: string, to: string) =>
    run(
      () =>
        move.mutateAsync({ from: source, to }).then(() => {
          closeFile(source);

          return reloadLoaded();
        }),
      "Moved",
    );

  // Before moving, check the destination for a same-name entry; on a collision, ask the user how to
  // resolve it (replace / keep both / cancel) instead of silently overwriting or failing.
  const attemptMove = (source: string, destDir: string) =>
    run(async () => {
      const name = baseOf(source);
      const dest = await fetchDir(deploymentId, volume, destDir);
      const clash = dest.entries.find((entry) => entry.name === name);

      if (clash) {
        setDialog({
          kind: "conflict",
          source,
          destDir,
          existingIsDir: clash.type === "dir",
          names: dest.entries.map((entry) => entry.name),
        });

        return;
      }

      await performMove(source, joinPath(destDir, name));
    });

  // "Replace" on a conflict: remove the existing target (recursively, in case it's a folder), then move.
  const replaceMove = (source: string, destDir: string) => {
    const to = joinPath(destDir, baseOf(source));

    void run(
      () =>
        del
          .mutateAsync({ path: to, recursive: true })
          .then(() => move.mutateAsync({ from: source, to }))
          .then(() => {
            closeFile(source);
            closeFile(to);

            return reloadLoaded();
          }),
      "Moved",
    );
    setDialog(null);
  };

  // Drag-and-drop drop handler: ignore no-op drops onto the current parent, reject illegal ones.
  const onMoveInto = (source: string, destDir: string) => {
    if (destDir === dirOf(source)) {
      return;
    }

    if (isMoveInvalid(source, destDir)) {
      void run(() => Promise.reject(new Error("Can't move a folder into itself")));

      return;
    }

    void attemptMove(source, destDir);
  };

  const submitPermissions = (
    path: string,
    value: { mode: string; uid: number; gid: number; recursive: boolean },
  ) => {
    void run(
      () =>
        chmod
          .mutateAsync({ path, mode: value.mode, recursive: value.recursive })
          .then(() =>
            chown.mutateAsync({ path, uid: value.uid, gid: value.gid, recursive: value.recursive }),
          )
          .then(() => reloadLoaded()),
      "Permissions updated",
    );
    setDialog(null);
  };

  const submitUpload = (dir: string, file: File) => {
    void run(() => upload.mutateAsync({ dir, file }).then(() => reloadLoaded()), "Uploaded");
    setDialog(null);
  };

  const deleteEntry = (path: string, isDir: boolean) => {
    void run(
      () =>
        del.mutateAsync({ path, recursive: isDir }).then(() => {
          closeFile(path);

          return reloadLoaded();
        }),
      "Deleted",
    );
    setDialog(null);
  };

  const openMenu = (event: MouseEvent, path: string, entry: DirEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, path, entry });
  };

  const closeMenu = () => setMenu(null);

  const isDirTarget = menu?.entry === null || menu?.entry?.type === "dir";

  return (
    <Box
      sx={{
        display: "flex",
        height: "calc(100dvh - 12rem)",
        minHeight: 420,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: 320,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <FileTree
          treeData={treeData}
          expanded={expanded}
          selectedPath={activePath}
          canOperate={canOperate}
          onExpandedChange={setExpanded}
          onLoadDir={(path) => void loadDir(path)}
          onOpenFile={openFile}
          onSelectDir={setActiveDir}
          onContextMenu={openMenu}
          onMoveInto={onMoveInto}
        />
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <FileEditorTabs
          files={openFiles}
          activePath={activePath}
          canOperate={canOperate}
          onActivate={setActivePath}
          onClose={closeFile}
          onChange={changeFile}
          onSave={saveFile}
          onDownload={(path) => void downloadPath(path)}
        />
      </Box>

      <Menu
        open={menu !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        {menu && !isDirTarget && menu.entry && (
          <MenuItem
            onClick={() => {
              openFile(menu.path);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <FileOpenOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Open</ListItemText>
          </MenuItem>
        )}

        {menu && isDirTarget && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              promptNewFile(targetDir(menu));
              closeMenu();
            }}
          >
            <ListItemIcon>
              <NoteAddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>New file</ListItemText>
          </MenuItem>
        )}

        {menu && isDirTarget && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              promptNewFolder(targetDir(menu));
              closeMenu();
            }}
          >
            <ListItemIcon>
              <CreateNewFolderIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>New folder</ListItemText>
          </MenuItem>
        )}

        {menu && isDirTarget && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              setDialog({ kind: "upload", dir: targetDir(menu) });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <UploadFileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Upload here</ListItemText>
          </MenuItem>
        )}

        {menu?.entry && <Divider />}

        {menu?.entry && (
          <MenuItem
            onClick={() => {
              void downloadPath(menu.path);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Download</ListItemText>
          </MenuItem>
        )}

        {menu?.entry && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              promptRename(menu.path);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <DriveFileRenameOutlineIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
        )}

        {menu?.entry && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              setDialog({ kind: "move", source: menu.path });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <DriveFileMoveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move…</ListItemText>
          </MenuItem>
        )}

        {menu?.entry && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              const { entry, path } = menu;

              if (!entry) {
                return;
              }

              setDialog({
                kind: "permissions",
                path,
                mode: entry.mode,
                uid: entry.uid,
                gid: entry.gid,
                isDir: entry.type === "dir",
              });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <LockOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Permissions</ListItemText>
          </MenuItem>
        )}

        {menu?.entry && (
          <MenuItem
            disabled={!canOperate}
            onClick={() => {
              setDialog({ kind: "delete", path: menu.path, isDir: menu.entry?.type === "dir" });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <DeleteOutlineIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
          </MenuItem>
        )}

        {!canOperate && <MenuItem disabled>{ROLE_REASON.operate}</MenuItem>}
      </Menu>

      {dialog?.kind === "name" && (
        <NameDialog
          title={dialog.title}
          label={dialog.label}
          confirmLabel={dialog.confirm}
          initial={dialog.initial}
          taken={dialog.taken ?? []}
          onClose={() => setDialog(null)}
          onSubmit={dialog.submit}
        />
      )}

      {dialog?.kind === "permissions" && (
        <PermissionsDialog
          initial={{ mode: dialog.mode, uid: dialog.uid, gid: dialog.gid }}
          isDir={dialog.isDir}
          users={identities?.users ?? []}
          groups={identities?.groups ?? []}
          onClose={() => setDialog(null)}
          onSubmit={(value) => submitPermissions(dialog.path, value)}
        />
      )}

      {dialog?.kind === "upload" && (
        <UploadDialog
          dir={dialog.dir}
          onClose={() => setDialog(null)}
          onSubmit={(file) => submitUpload(dialog.dir, file)}
        />
      )}

      {dialog?.kind === "move" && (
        <MoveDialog
          deploymentId={deploymentId}
          volume={volume}
          source={dialog.source}
          onClose={() => setDialog(null)}
          onSubmit={(destDir) => {
            const { source } = dialog;
            setDialog(null);
            void attemptMove(source, destDir);
          }}
        />
      )}

      {dialog?.kind === "conflict" && (
        <ConflictDialog
          name={baseOf(dialog.source)}
          destDir={dialog.destDir}
          existingIsDir={dialog.existingIsDir}
          onCancel={() => setDialog(null)}
          onReplace={() => replaceMove(dialog.source, dialog.destDir)}
          onRename={() => {
            const { source, destDir, names } = dialog;

            setDialog({
              kind: "name",
              title: "Keep both — new name",
              label: "New name",
              confirm: "Move",
              initial: suggestCopyName(baseOf(source), names),
              taken: names,
              submit: (name) => {
                void performMove(source, joinPath(destDir, name));
                setDialog(null);
              },
            });
          }}
        />
      )}

      {dialog?.kind === "delete" && (
        <DeleteDialog
          name={baseOf(dialog.path)}
          isDir={dialog.isDir}
          onClose={() => setDialog(null)}
          onConfirm={() => deleteEntry(dialog.path, dialog.isDir)}
        />
      )}
    </Box>
  );
}
