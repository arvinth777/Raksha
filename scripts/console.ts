import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomUUID } from "node:crypto";
import { run } from "./convex-cli";
const io = createInterface({ input: stdin, output: stdout });
let sessionId = "";
console.log(
  "RAKSHA BACKEND TEST CONSOLE — demo is synthetic; live calls require server configuration.\nStart the Convex dev server in another terminal. No emergency services are contacted.",
);
try {
  while (true) {
    const cmd = (
      await io.question(
        "\nCommands: demo, live, attach, status, speech, check, safe, sos, stop, quit\n> ",
      )
    ).trim();
    try {
      if (cmd === "quit") break;
      if (cmd === "demo" || cmd === "live") {
        const consent =
          (await io.question(
            "Allow automatic escalation to the consenting TEST responder on missed check-in? Type yes: ",
          )) === "yes";
        if (
          cmd === "live" &&
          (await io.question(
            "This may place real calls to configured test numbers. Type CALL: ",
          )) !== "CALL"
        )
          continue;
        sessionId = await run("sessions:testStart", {
          clientRequestId: randomUUID(),
          mode: cmd,
          autoEscalate: consent,
        });
        console.log("Session:", sessionId);
        continue;
      }
      if (cmd === "attach") {
        sessionId = (await io.question("Session ID: ")).trim();
        continue;
      }
      if (!sessionId) {
        console.log("Start or attach a session first.");
        continue;
      }
      if (cmd === "status")
        console.dir(await run("sessions:inspect", { sessionId }), { depth: 6 });
      else if (cmd === "speech")
        await run("ingest:demoSpeech", {
          sessionId,
          text: await io.question("Synthetic user speech: "),
        });
      else if (cmd === "check")
        console.log(
          await run("sessions:testCheckIn", { sessionId, reason: "risk" }),
        );
      else if (cmd === "safe") {
        const { checkIn } = await run("sessions:inspect", { sessionId });
        if (checkIn)
          await run("sessions:testRespond", {
            checkInId: checkIn._id,
            expectedVersion: checkIn.version,
          });
        else
          console.log(
            "No check-in. Existing incidents require operator resolution.",
          );
      } else if (cmd === "sos")
        console.log(await run("sessions:testSos", { sessionId }));
      else if (cmd === "stop") {
        await run("sessions:testEnd", { sessionId });
        console.log(
          "Monitoring stopped. Hang up the phone manually; incidents remain open.",
        );
      } else console.log("Unknown command.");
    } catch (e) {
      console.error((e as Error).message);
    }
  }
} finally {
  io.close();
}
