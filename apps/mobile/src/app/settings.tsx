import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

// Existing bookmarks open the menu; preferences no longer need a separate page.
export default function Settings() {
  const token = useSession(state => state.token);
  return <Redirect href={token ? { pathname: "/profile", params: { menu: "1" } } : { pathname: "/welcome", params: { menu: "1" } }} />;
}
