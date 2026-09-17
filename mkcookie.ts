import { sign, findUserByEmail } from "./auth/db.ts";
const user = findUserByEmail(process.argv[2]);
if (!user) { console.error("no user"); process.exit(1); }
const p = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + 3600_000 })).toString("base64url");
console.log(`${p}.${sign(p)}`);
