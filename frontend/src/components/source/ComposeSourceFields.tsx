import { TextField } from "@mui/material";
import { GitRepoFields } from "./GitRepoFields";
import type { SourceFieldsProps } from "./sourceTypes";

// Git + Docker Compose: repository fields plus the compose file path. Willy brings up the whole
// stack — there's no single "web service" to name; domains route to a service (defaulting to the
// first declared) and healthchecks are configured per service in the Health section.
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
    </>
  );
}
