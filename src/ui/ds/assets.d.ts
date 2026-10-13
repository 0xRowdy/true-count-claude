// Bundled images resolve to an asset id (native) or URI (web), both valid Image sources.
declare module "*.jpg" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}
