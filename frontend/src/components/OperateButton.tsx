import { Button, type ButtonProps, IconButton, type IconButtonProps } from "@mui/material";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { Gated } from "./Gated";

// A Button that requires the Operator capability: when the user lacks it the button is force-disabled
// and tooltip-explained (via Gated), otherwise it behaves as a normal Button (the caller's own
// disabled/pending state still applies). Collapses the repeated
// `<Gated can={canOperate} reason={ROLE_REASON.operate}><Button/></Gated>` wrapper.
export function OperateButton(props: ButtonProps) {
  const canOperate = useCan("operate");

  return (
    <Gated can={canOperate} reason={ROLE_REASON.operate}>
      <Button {...props} />
    </Gated>
  );
}

// IconButton counterpart of OperateButton.
export function OperateIconButton(props: IconButtonProps) {
  const canOperate = useCan("operate");

  return (
    <Gated can={canOperate} reason={ROLE_REASON.operate}>
      <IconButton {...props} />
    </Gated>
  );
}
