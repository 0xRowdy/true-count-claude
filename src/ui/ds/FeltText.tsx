import { Text, type TextProps } from "react-native";
import { surfaces, textScale } from "./tokens";

/**
 * Type printed on a felt, a bet spot or the chip rack: Felt Print ink (the One Ink Rule), capped
 * at 1.3× the system text size so the table keeps its shape (the Fixed Felt Rule). `fixed` is
 * for a glyph inside a fixed shape (a chip's value, the puck, a tag on a bet spot), which never
 * scales. Felt Cream, gold and chip inks come through `style`.
 */
export function FeltText({
  fixed = false,
  style,
  ...props
}: Omit<TextProps, "maxFontSizeMultiplier"> & { fixed?: boolean }) {
  return (
    <Text
      {...props}
      style={[{ color: surfaces.feltPrint }, style]}
      maxFontSizeMultiplier={fixed ? textScale.fixed : textScale.felt}
    />
  );
}
