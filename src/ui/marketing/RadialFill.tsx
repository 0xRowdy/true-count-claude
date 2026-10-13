import { useId } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * A radial gradient that fills its parent, positioned like the design's radial fills:
 * `center` and `size` are fractions of the box (size 1 = the gradient's diameter spans the box).
 */
export function RadialFill({
  from,
  to,
  fromOpacity = 1,
  toOpacity = 1,
  center = { x: 0.5, y: 0.5 },
  size = { width: 1, height: 1 },
}: {
  from: string;
  to: string;
  fromOpacity?: number;
  toOpacity?: number;
  center?: { x: number; y: number };
  size?: { width: number; height: number };
}) {
  // useId is stable between the static render and hydration; SVG ids want no punctuation.
  const id = `r${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { x, y } = center;
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient
          id={id}
          cx={x}
          cy={y}
          r={0.5}
          gradientUnits="objectBoundingBox"
          gradientTransform={`translate(${x} ${y}) scale(${size.width} ${size.height}) translate(${-x} ${-y})`}
        >
          <Stop offset={0} stopColor={from} stopOpacity={fromOpacity} />
          <Stop offset={1} stopColor={to} stopOpacity={toOpacity} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
