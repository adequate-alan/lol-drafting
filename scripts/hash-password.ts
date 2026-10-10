// Prints an AUTH_PASSWORD_HASH value. The password is read from stdin and never stored.
//   npm run hash-password            (then type the password and press Enter)
import { createInterface } from "node:readline";
import { hashPassword } from "../lib/auth/password";

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
process.stderr.write("Password: ");
rl.once("line", async (line) => {
  rl.close();
  if (line.length < 12) {
    console.error("Use at least 12 characters.");
    process.exit(1);
  }
  console.log(await hashPassword(line));
});
