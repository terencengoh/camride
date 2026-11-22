import { Share } from "react-native";
import { SHARE_URL, SUPABASE_URL } from "./env";

export function tripShareUrl(token: string): string {
  return SHARE_URL ? `${SHARE_URL}?t=${token}` : `${SUPABASE_URL}/functions/v1/trip-share?t=${token}`;
}

export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
}
