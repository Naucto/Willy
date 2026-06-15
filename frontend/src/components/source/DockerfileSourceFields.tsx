import { TextField } from "@mui/material";
import { GitRepoFields } from "./GitRepoFields";
import type { SourceFieldsProps } from "./sourceTypes";

// Git + Dockerfile: repository fields plus the Dockerfile path within the repo.
export function DockerfileSourceFields(props: SourceFieldsProps) {
  const { value, onChange } = props;

  return (
    <>
      <GitRepoFields {...props} />
      <TextField
        label="Dockerfile path"
        placeholder="Dockerfile"
        value={value.dockerfilePath}
        onChange={(event) => onChange({ dockerfilePath: event.target.value })}
      />
    </>
  );
}
