import { TextField } from "@mui/material";
import { GitRepoFields } from "./GitRepoFields";
import type { SourceFieldsProps } from "./sourceTypes";

// Git + Docker Compose: repository fields plus the compose file path and the web service Willy
// routes to the domain and health-checks.
export function ComposeSourceFields(props: SourceFieldsProps) {
  const { value, onChange } = props;

  return (
    <>
      <GitRepoFields {...props} />
      <TextField
        label="Compose file path"
        placeholder="docker-compose.yml"
        value={value.composeFilePath}
        onChange={(event) => onChange({ composeFilePath: event.target.value })}
      />
      <TextField
        label="Compose web service"
        placeholder="frontend"
        helperText="The service Willy routes to the domain and health-checks."
        value={value.composeWebService}
        onChange={(event) => onChange({ composeWebService: event.target.value })}
      />
    </>
  );
}
