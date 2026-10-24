import { Redirect } from "expo-router";

// The protected navigator lands on the auth group after logout or a first visit.
export default function AuthIndex() {
  return <Redirect href="/welcome" />;
}
