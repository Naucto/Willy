import { Box } from "@mui/material";
import { keyframes } from "@mui/system";
import type { ReactNode } from "react";

const DISTANCE = 24;

const enterFromRight = keyframes({
  from: { opacity: 0, transform: `translateX(${DISTANCE}px)` },
  to: { opacity: 1, transform: "translateX(0)" },
});

const enterFromLeft = keyframes({
  from: { opacity: 0, transform: `translateX(-${DISTANCE}px)` },
  to: { opacity: 1, transform: "translateX(0)" },
});

// A slide+fade-in played on mount, replayed whenever the parent changes this component's `key`.
// `direction` is the side the panel enters FROM: "right" reads as a forward drill (right-to-left),
// "left" as going back. Generic enough to wrap any sub-page panel or content.
export function SlideFade({
  direction,
  children,
}: {
  direction: "left" | "right";
  children: ReactNode;
}) {
  return (
    <Box
      sx={(theme) => ({
        animation: `${direction === "right" ? enterFromRight : enterFromLeft} ${theme.transitions.duration.enteringScreen}ms ${theme.transitions.easing.easeOut} both`,
      })}
    >
      {children}
    </Box>
  );
}
