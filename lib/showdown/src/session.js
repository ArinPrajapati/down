import { connect, waitForChallstr, sendTrn } from "./client.js";
import { loginWithPassword } from "./auth.js";

export async function openAuthenticatedSession({
  websocketUrl,
  createWebSocket,
  username,
  password,
  loginUrl,
  fetchImpl,
}) {
  const socket = await connect({ websocketUrl, createWebSocket });
  const challstr = await waitForChallstr(socket);
  const assertion = await loginWithPassword({
    loginUrl,
    username,
    password,
    challstr,
    fetchImpl,
  });

  sendTrn(socket, username, assertion);

  return {
    socket,
    challstr,
    assertion,
  };
}
