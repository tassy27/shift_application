function pad2(v) {
  return String(v).padStart(2, "0");
}

function buildTimeOptions(selected) {
  const times = [];
  for (let h = 0; h < 24; h++) {
    times.push(`${pad2(h)}:00`);
    times.push(`${pad2(h)}:30`);
  }
  return times
    .map((t) => `<option value="${t}" ${t === selected ? "selected" : ""}>${t}</option>`)
    .join("");
}

function toMonthDay(isoDate) {
  const parts = isoDate.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

async function req(path, opts = {}) {
  const r = await fetch(path, opts);
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!r.ok) throw { status: r.status, body };
  return body;
}

async function getMeOrNull() {
  try {
    const r = await req("/api/v1/me");
    return r.data;
  } catch {
    return null;
  }
}

async function getConfigStatusOrNull() {
  try {
    const r = await req("/api/v1/config/status");
    return r.data;
  } catch {
    return null;
  }
}


function relocateTopNavAboveDebug() {
  const navs = Array.from(document.querySelectorAll('.top-nav'));
  if (!navs.length) return;

  navs.forEach((nav) => {
    if (nav.dataset.relocatedNav === '1') return;

    const shell = nav.closest('.container') || document.body;
    const targetSelector = nav.dataset.navTarget;
    if (targetSelector) {
      const target = shell.querySelector(targetSelector) || document.querySelector(targetSelector);
      if (target && target.parentNode) {
        nav.dataset.relocatedNav = '1';
        nav.classList.add('is-bottom-nav');
        target.parentNode.insertBefore(nav, target.nextSibling);
        return;
      }
    }

    const debugOut = shell.querySelector('pre#out');
    const debugCard = debugOut ? debugOut.closest('section.card, .card') : null;
    if (!debugCard) return;
    if (debugCard.previousElementSibling === nav) return;

    nav.dataset.relocatedNav = '1';
    nav.classList.add('is-bottom-nav');
    debugCard.parentNode.insertBefore(nav, debugCard);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', relocateTopNavAboveDebug);
} else {
  relocateTopNavAboveDebug();
}
