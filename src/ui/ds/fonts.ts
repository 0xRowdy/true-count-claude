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
 * Ready when fonts load or fail, so native can defer text measurement without getting stuck.
 * Web must render immediately to preserve the static export's hydration tree.
 */
export function useTablesideFonts(): boolean {
  const [loaded, error] = useFonts(FONT_MAP);
  return loaded || error !== null;
}
