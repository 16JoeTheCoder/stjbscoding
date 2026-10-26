// Students join a class with the code their teacher gives them. The teacher then approves.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { pageHead, busy, problem, notice } from "../ui.js";

export default async function join(ctx) {
  const s = { code: "", error: "", done: "" };
  const submit = (e) => busy(e, async () => {
    s.error = "";
    const code = s.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("A join code has 6 letters and digits.");
    const jc = await data.requestToJoin(ctx.me, code);
    ctx.me.classIds = [...new Set([...(ctx.me.classIds || []), jc.classId])];
    s.done = `Request sent to ${jc.className}. Your teacher will approve you.`;
    s.code = "";
    ctx.rerender();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  return () => html`
    ${pageHead("Classes", "Join a", "class")}
    ${s.error ? problem(s.error) : nothing}
    ${s.done ? notice(s.done, "ok") : nothing}
    <form class="form" @submit=${(e) => { e.preventDefault(); submit({ currentTarget: e.target.querySelector("button") }); }}>
      <label class="jy-field"><span class="jy-field__label">Join code</span>
        <input class="jy-field__input mono" maxlength="6" autocomplete="off" autocapitalize="characters" .value=${s.code}
          @input=${(e) => { s.code = e.target.value; }} placeholder="ABC234" />
        <span class="jy-field__help">Your student teacher has it.</span></label>
      <div><button class="jy-btn" type="submit">Ask to join</button></div>
    </form>`;
}
