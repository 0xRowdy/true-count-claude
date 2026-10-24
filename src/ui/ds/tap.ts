import { Platform } from "react-native";

/**
 * Minimum tap target, both axes: 44pt on iOS and the web (HIG), 48dp on Android (Material).
 * Kept out of `tokens.ts`, which the Node test suite imports and must not load React Native.
 */
export const MIN_TAP = Platform.OS === "android" ? 48 : 44;
