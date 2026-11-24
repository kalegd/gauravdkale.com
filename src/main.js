import { details } from "./content.js";
import { startScene } from "./scene.js";

const scene = startScene();
const panel = document.querySelector("#detail");
const close = panel.querySelector(".detail-close");
const fields = Object.fromEntries(
  ["category", "title", "subtitle", "summary", "highlights", "stack", "link"]
    .map((name) => [name, document.querySelector("#detail-" + name)]),
);
let opener;

for (const button of document.querySelectorAll(".detail-trigger")) {
  const key = button.dataset.detail;
  const entry = details[key];
  const form = button.matches(".work-trigger") ? key : null;
  if (form) {
    button.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") scene.selectForm(form);
    });
    button.addEventListener("focus", () => scene.selectForm(form));
  }
  button.addEventListener("click", () => {
    for (const name of ["category", "title", "subtitle", "summary", "stack"]) {
      fields[name].textContent = entry[name] || "";
    }
    fields.stack.hidden = !entry.stack;
    fields.highlights.hidden = !entry.highlights;
    fields.highlights.replaceChildren(...(entry.highlights || []).map((highlight) => {
      const item = document.createElement("li");
      item.textContent = highlight;
      return item;
    }));
    fields.link.hidden = !entry.link;
    if (entry.link) {
      fields.link.textContent = entry.link[0];
      fields.link.href = entry.link[1];
    } else {
      fields.link.removeAttribute("href");
    }
    opener = button;
    scene.selectForm(form);
    scene.setDetail(true);
    document.body.classList.add("detail-open");
    panel.showModal();
    panel.scrollTop = 0;
  });
}

close.addEventListener("click", () => panel.close());
let backdropDown = false;
panel.addEventListener("pointerdown", (event) => { backdropDown = event.target === panel; });
panel.addEventListener("click", (event) => {
  if (backdropDown && event.target === panel) panel.close();
});
panel.addEventListener("close", () => {
  document.body.classList.remove("detail-open");
  scene.setDetail(false);
  opener?.focus({ preventScroll: true });
});
