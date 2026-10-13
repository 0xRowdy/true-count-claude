import { useId } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/**
 * A linear gradient that fills its parent (position the parent, give it `overflow: hidden`
 * or a radius to clip). `angle` follows CSS: 180 = top → bottom, 135 = top-left → bottom-right.
 */
export function Gradient({
  from,
  to,
  angle = 180,
  radius = 0,
}: {
  from: string;
  to: string;
  angle?: number;
  radius?: number;
}) {
  // useId is stable between the static render and hydration; SVG ids want no punctuation.
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const a = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(a) / 2;
  const dy = Math.sin(a) / 2;
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient
          id={id}
          x1={0.5 - dx}
          y1={0.5 - dy}
          x2={0.5 + dx}
          y2={0.5 + dy}
          gradientUnits="objectBoundingBox"
        >
          <Stop offset={0} stopColor={from} />
          <Stop offset={1} stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}
