import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

/** Jury entry: start a real conversation through the six project stages, without seeded examples. */
export default function Demo() {
  const token = useSession(state => state.token);
  return <Redirect href={token ? "/new" : "/sign-in"} />;
}
