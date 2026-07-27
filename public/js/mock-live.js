const params = new URLSearchParams(location.search);
const target = params.get("url") ?? "";
const mode = params.get("mode") === "devtools" ? "devtools" : "tab";

document.querySelector("#mock-url").textContent = target || "—";
document.querySelector("#mock-mode").textContent = mode;
