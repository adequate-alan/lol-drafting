export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invalid: "Wrong username or password.",
  config: "Login is not configured on the server (missing environment variables).",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/login">
        <h1>Clash Draft Room</h1>
        <label>
          Username
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="error">{MESSAGES[error] ?? "Sign-in failed."}</p>}
        <button className="btn primary" type="submit">Sign in</button>
      </form>
    </main>
  );
}
