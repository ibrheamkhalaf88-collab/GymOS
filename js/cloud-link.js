// ============================================================
// Cloud link — bind an email/Google session to its server code
//
// Gym cloud data is keyed by an activation code (see /api/gym). Email auth
// users never entered a code, so without this step NOTHING they saved ever
// reached the cloud — and a second device they signed into looked empty.
// After Supabase auth succeeds we ask the server for the code bound to the
// user id (or mint a trial one), install it as the device licence, and turn
// cloud sync on. Never throws: a network failure must not break sign-in.
// ============================================================

import { findLinkedCode, mintLinkedTrial, setJwt } from "./db.js";
import { license, deviceName, getDeviceId } from "./license.js";

export async function linkCloudIdentity(supabase) {
  try {
    if (!supabase) return false;
    if (license.get()?.code) return true; // already licenced on this device
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return false;
    const deviceId = getDeviceId();
    let res;
    try {
      res = await findLinkedCode(token, deviceId, deviceName());
    } catch (e) {
      if (e?.code !== "NO_CODE") throw e; // 429/500/network → try again next sign-in
      // No code yet — first sign-in for this account: mint its trial code.
      res = await mintLinkedTrial(token, deviceId);
    }
    if (!res?.record?.code || !res?.token) return false;
    license.save(res.record);
    setJwt(res.token);
    localStorage.setItem("dp_license_mode", "online");
    const L = license.get();
    localStorage.setItem("dp_cloud", L && L.data_enabled !== false ? "1" : "0");
    return true;
  } catch (e) {
    console.warn("[cloud-link] skipped:", e?.message || e);
    return false;
  }
}
