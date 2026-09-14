const BUTTON_ID = "candc-restart-fresh-run";
const STATUS_ID = "candc-restart-status";

function activityIdFromLocation() {
  const pathMatch = window.location.pathname.match(/^\/stage3\/control\/([^/?#]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  const hashMatch = window.location.hash.match(/^#\/stage3\/control\/([^?]+)/);
  return hashMatch ? decodeURIComponent(hashMatch[1]) : null;
}

function lecturerKey() {
  const stored = window.sessionStorage.getItem("candc-lecturer-key") || "";
  if (stored) return stored;
  return document.querySelector(".candc-key input")?.value?.trim() || "";
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function statusNode(container) {
  let node = document.getElementById(STATUS_ID);
  if (!node) {
    node = document.createElement("p");
    node.id = STATUS_ID;
    node.className = "candc-restart-status";
    node.style.cssText = "margin:.55rem 0 0;color:var(--candc-muted);font-size:.82rem;line-height:1.35";
    container.appendChild(node);
  }
  return node;
}

async function restartFresh(button, container) {
  const activityId = activityIdFromLocation();
  const key = lecturerKey();
  const status = statusNode(container);
  if (!activityId) return;
  if (!key) {
    status.textContent = "Enter the facilitator key first, then try the restart again.";
    return;
  }

  const confirmed = window.confirm(
    "Abandon this run and start a completely fresh one?\n\n" +
    "The current run and its responses will remain stored, but nothing will carry into the new run. " +
    "Students will need to return to the B1141 portal and open the activity again."
  );
  if (!confirmed) return;

  window.sessionStorage.setItem("candc-lecturer-key", key);
  button.disabled = true;
  button.textContent = "Starting fresh run…";
  status.textContent = "Closing the current run…";

  const headers = { "X-GEDL-Lecturer-Key": key };

  try {
    let current = null;
    try {
      current = await request(`/api/candc/activities/${encodeURIComponent(activityId)}/session`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    if (current?.id) {
      await request(`/api/candc/sessions/${encodeURIComponent(current.id)}/close`, {
        method: "POST",
        headers,
      });
    }

    status.textContent = "Creating a fresh run…";
    const fresh = await request(`/api/candc/activities/${encodeURIComponent(activityId)}/sessions`, {
      method: "POST",
      headers,
    });

    status.textContent = `Fresh run started${fresh?.id ? ` (${String(fresh.id).slice(0, 8)}…)` : ""}. Ask students to return to the portal and reopen the activity.`;
    button.textContent = "Fresh run started";
    window.setTimeout(() => {
      status.textContent = "";
      button.disabled = false;
      button.textContent = "Restart with fresh run";
    }, 12000);
  } catch (error) {
    status.textContent = `Recovery failed: ${error.message}. The previous run may already be closed; retry once or use CRUD if needed.`;
    button.disabled = false;
    button.textContent = "Restart with fresh run";
  }
}

function install() {
  if (!activityIdFromLocation()) return;
  if (document.getElementById(BUTTON_ID)) return;

  const endButton = Array.from(document.querySelectorAll(".candc-control-block button"))
    .find((item) => item.textContent?.trim() === "End session");
  if (!endButton) return;

  const container = endButton.closest(".candc-control-block");
  if (!container) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = "candc-secondary";
  button.style.marginRight = ".5rem";
  button.textContent = "Restart with fresh run";
  button.title = "Emergency recovery: close this run and create a new empty run.";
  button.addEventListener("click", () => restartFresh(button, container));

  container.insertBefore(button, endButton);
}

const observer = new MutationObserver(install);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", install);
window.addEventListener("hashchange", install);
install();
