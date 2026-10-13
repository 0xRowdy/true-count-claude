import { useFonts } from "expo-font";
import { Fraunces_400Regular } from "@expo-google-fonts/fraunces/400Regular";
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { fontFamily } from "./tokens";

/** Exactly the faces `fontFamily` names, imported per weight so nothing else is bundled. */
export const FONT_MAP = {
  [fontFamily.display[400]]: Fraunces_400Regular,
  [fontFamily.display[500]]: Fraunces_500Medium,
  [fontFamily.display[600]]: Fraunces_600SemiBold,
  [fontFamily.ui[400]]: Inter_400Regular,
  [fontFamily.ui[500]]: Inter_500Medium,
  [fontFamily.ui[600]]: Inter_600SemiBold,
  [fontFamily.ui[700]]: Inter_700Bold,
  [fontFamily.ui[800]]: Inter_800ExtraBold,
};

/**
 * Loads Fraunces + Inter. Never gate rendering on the result: in the static web export the
 * server render registers the @font-face rules into the HTML, so the client hydrates the same
 * tree; on native, text falls back to the system face for the first frames.
 */
export function useTablesideFonts(): boolean {
  const [loaded] = useFonts(FONT_MAP);
  return loaded;
}
