import { QRCodeSVG } from "qrcode.react";

// Thin wrapper so the qrcode.react dependency can be lazy-loaded — it's only needed during the rare
// TOTP enrolment step, not on every login.
export function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  return <QRCodeSVG value={value} size={size} />;
}
