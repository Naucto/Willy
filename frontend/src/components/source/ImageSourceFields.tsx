import { Autocomplete, TextField } from "@mui/material";
import { useDockerImages } from "../../api/hooks";
import type { SourceFieldsProps } from "./sourceTypes";

// Docker image: a single image reference, with a browse list of the tagged images already on the
// host. Free-text so any registry reference (not just locally-present ones) can be entered.
export function ImageSourceFields({ value, onChange }: SourceFieldsProps) {
  const { data } = useDockerImages();

  return (
    <Autocomplete
      freeSolo
      options={data?.images ?? []}
      inputValue={value.imageRef}
      onInputChange={(_, input) => onChange({ imageRef: input })}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Image reference"
          placeholder="nginx:1.27 or ghcr.io/owner/app:tag"
          helperText="An existing image to run as-is. Pick a local image or type any registry reference."
        />
      )}
    />
  );
}
