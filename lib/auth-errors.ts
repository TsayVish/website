/** Turns Supabase auth error messages into plain sentences people can act on. */
export function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don’t match. Check both and try again.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link we sent.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "There’s already an account with that email. Log in instead.";
  if (m.includes("password should be") || m.includes("weak password"))
    return "Choose a stronger password: at least 8 characters, mixing letters and numbers.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts in a short time. Wait a minute, then try again.";
  if (m.includes("same password")) return "Choose a password you haven’t used for this account before.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Couldn’t reach the server. Check your connection and try again.";
  return message;
}
