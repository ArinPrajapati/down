export function parseLoginResponse(text) {
  const raw = String(text ?? "").trim();
  const jsonText = raw.startsWith("]") ? raw.slice(1) : raw;
  const data = JSON.parse(jsonText);
  if (!data?.assertion) {
    throw new Error("Login response missing assertion");
  }
  return data.assertion;
}

export async function loginWithPassword({
  loginUrl = "https://play.pokemonshowdown.com/api/login",
  username,
  password,
  challstr,
  fetchImpl = fetch,
}) {
  if (!username) throw new Error("username is required");
  if (!password) throw new Error("password is required");
  if (!challstr) throw new Error("challstr is required");
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function");

  const body = new URLSearchParams({
    name: username,
    pass: password,
    challstr,
  });

  const res = await fetchImpl(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  return parseLoginResponse(text);
}
