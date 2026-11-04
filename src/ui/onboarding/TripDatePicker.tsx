/**
 * The web has no system date picker to match the native ones, so onboarding keeps its typed
 * `YYYY-MM-DD` field there and this renders nothing. iOS and Android: `TripDatePicker.native.tsx`.
 */
export function TripDatePicker(_props: {
  value: string | null;
  today: string;
  onChange: (iso: string) => void;
}) {
  return null;
}
