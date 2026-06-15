import type { FC } from "react";
import type { BuildStrategy } from "../../api/types";
import { ComposeSourceFields } from "./ComposeSourceFields";
import { DockerfileSourceFields } from "./DockerfileSourceFields";
import { ImageSourceFields } from "./ImageSourceFields";
import type { SourceFieldsProps } from "./sourceTypes";

// Registry mapping each source type to its field component (all sharing SourceFieldsProps), so both
// the create wizard and the settings page render the source-specific inputs from one place.
const COMPONENTS: Record<BuildStrategy, FC<SourceFieldsProps>> = {
  DOCKERFILE: DockerfileSourceFields,
  COMPOSE: ComposeSourceFields,
  IMAGE: ImageSourceFields,
};

export function SourceFields(props: SourceFieldsProps) {
  const Fields = COMPONENTS[props.value.buildStrategy];

  return <Fields {...props} />;
}

export type { SourceFieldsProps, SourceValue } from "./sourceTypes";
export { isGitStrategy, SOURCE_OPTIONS, sourceDescription } from "./sourceTypes";
